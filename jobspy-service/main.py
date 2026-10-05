"""JobTrail sidecar — thin FastAPI wrapper around python-jobspy.

Responsibilities:
- Expose POST /search for JobSpy and the official JobTech APIs.
- Cache identical queries for JOBSPY_CACHE_TTL seconds (default 600) to avoid
  hammering LinkedIn, per python-jobspy's rate-limit notes.
- Require explicit JOBSPY_PROXIES and balance their starting positions.

Kept intentionally small. The NestJS backend does all CRUD/business logic.
"""

import logging
import math
import os
from typing import List, Optional, Literal
from concurrent.futures import ThreadPoolExecutor, wait
from threading import Lock
import arbetsformedlingen

from cachetools import TTLCache
from fastapi import FastAPI
from jobspy import scrape_jobs
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jobtrail-jobspy")

CACHE_TTL = int(os.environ.get("JOBSPY_CACHE_TTL", "600"))
PROXIES_RAW = os.environ.get("JOBSPY_PROXIES", "").strip()
PROXIES: Optional[List[str]] = (
    [p.strip() for p in PROXIES_RAW.split(",") if p.strip()] if PROXIES_RAW else None
)

SOURCE_TIMEOUT = 45
_jobspy_executor = ThreadPoolExecutor(max_workers=3)
_official_executor = ThreadPoolExecutor(max_workers=2)
_proxy_index = 0
_proxy_lock = Lock()


def _next_proxies():
    """Balance short searches too: JobSpy otherwise restarts at the first proxy."""
    global _proxy_index
    if not PROXIES:
        raise ValueError("A configured VPN proxy is required.")
    with _proxy_lock:
        start = _proxy_index % len(PROXIES)
        _proxy_index += 1
    return PROXIES[start:] + PROXIES[:start]


# maxsize chosen to comfortably hold a few dozen recent searches in memory.
_cache: TTLCache = TTLCache(maxsize=128, ttl=CACHE_TTL)


class SearchRequest(BaseModel):
    site_name: List[Literal["linkedin", "indeed", "glassdoor", "google", "ziprecruiter", "arbetsformedlingen", "jobadlinks"]] = Field(default_factory=lambda: ["linkedin", "indeed"], min_length=1, max_length=7)
    search_term: str
    location: Optional[str] = None
    country: Literal["sweden", "denmark"] = "sweden"
    results_wanted: int = Field(default=25, ge=1, le=100)
    # Skip the first N results — used by the frontend's "Load more" pagination so a single
    # logical search can pull pages 0, 25, 50, … without rerunning everything from scratch.
    offset: int = Field(default=0, ge=0, le=2000)
    hours_old: Optional[int] = None
    is_remote: Optional[bool] = None
    job_type: Optional[str] = None  # "fulltime" | "parttime" | "contract" | "internship"


class JobResult(BaseModel):
    site: str
    id: str
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    description: Optional[str] = None
    is_remote: Optional[bool] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    currency: Optional[str] = None
    date_posted: Optional[str] = None
    job_type: Optional[str] = None


class SourceError(BaseModel):
    site: str
    message: str


class SearchResponse(BaseModel):
    cached: bool
    count: int
    results: List[JobResult]
    errors: List[SourceError] = Field(default_factory=list)
    has_more: bool = False


app = FastAPI(title="JobTrail JobSpy Sidecar", version="0.1.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "cache_ttl": CACHE_TTL,
        "proxy_count": len(PROXIES) if PROXIES else 0,
    }


def _cache_key(req: SearchRequest) -> str:
    return "|".join(
        [
            ",".join(sorted(req.site_name)),
            req.search_term.lower().strip(),
            (req.location or "").lower().strip(),
            str(req.results_wanted),
            str(req.offset),
            str(req.hours_old),
            str(req.is_remote),
            str(req.job_type),
            req.country,
        ]
    )


def _clean(value):
    """Drop NaN / NaT / non-JSON-serializable values."""
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except TypeError:
        pass
    # pandas Timestamps -> ISO string
    iso = getattr(value, "isoformat", None)
    if callable(iso):
        try:
            return iso()
        except Exception:
            return str(value)
    return value


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    key = _cache_key(req)
    if key in _cache:
        logger.info("cache hit: %s", key)
        return SearchResponse(cached=True, **_cache[key])

    def collect(site):
        try:
            proxies = _next_proxies()
            if site in arbetsformedlingen.SOURCES:
                rows = [JobResult(**row) for row in arbetsformedlingen.search(site, req, proxies)]
            else:
                rows = _jobspy_results(req, site, proxies)
            warning = None
            if not rows and site not in arbetsformedlingen.SOURCES:
                warning = SourceError(site=site, message="No results returned; the source may be empty or blocked.")
            return rows, warning
        except Exception as exc:
            logger.warning("Search source %s failed (%s)", site, type(exc).__name__)
            message = str(exc) if isinstance(exc, ValueError) else "Source unavailable: connection, rate-limit, or upstream failure."
            return [], SourceError(site=site, message=message)

    # Return completed sources before the backend's 60-second deadline. Workers remain
    # bounded when a dependency honours a long Retry-After and cannot be interrupted.
    futures = {site: (_official_executor if site in arbetsformedlingen.SOURCES else _jobspy_executor).submit(collect, site)
               for site in dict.fromkeys(req.site_name)}
    done, _ = wait(futures.values(), timeout=SOURCE_TIMEOUT)
    pages = []
    for site, future in futures.items():
        if future in done:
            pages.append(future.result())
        else:
            future.cancel()
            pages.append(([], SourceError(site=site, message="Source timed out; completed sources are shown.")))
    results = [row for rows, _ in pages for row in rows]
    errors = [error for _, error in pages if error]
    payload = {"count": len(results), "results": [r.model_dump() for r in results],
               "errors": [e.model_dump() for e in errors],
               "has_more": req.offset < 2000 and any(len(rows) == req.results_wanted for rows, _ in pages)}
    if results or not errors:
        _cache[key] = payload
    return SearchResponse(cached=False, **payload)


def _jobspy_results(req: SearchRequest, site: str, proxies: List[str]) -> List[JobResult]:
    df = scrape_jobs(
        site_name=[site], search_term=req.search_term, location=req.location,
        results_wanted=req.results_wanted, offset=req.offset, hours_old=req.hours_old,
        is_remote=req.is_remote or False, job_type=req.job_type, proxies=proxies,
        country_indeed=req.country,
    )

    results: List[JobResult] = []
    if df is not None and len(df) > 0:
        for _, row in df.iterrows():
            site = _clean(row.get("site")) or "unknown"
            external_id = _clean(row.get("id")) or _clean(row.get("job_url")) or ""
            results.append(
                JobResult(
                    site=str(site),
                    id=str(external_id),
                    title=_clean(row.get("title")),
                    company=_clean(row.get("company")),
                    location=_clean(row.get("location")),
                    job_url=_clean(row.get("job_url")),
                    description=_clean(row.get("description")),
                    is_remote=_clean(row.get("is_remote")),
                    min_amount=_clean(row.get("min_amount")),
                    max_amount=_clean(row.get("max_amount")),
                    currency=_clean(row.get("currency")),
                    date_posted=_clean(row.get("date_posted")),
                    job_type=_clean(row.get("job_type")),
                )
            )

    return results
