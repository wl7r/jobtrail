"""Official JobTech APIs, adapted to JobTrail's Discover result format."""
from cachetools import TTLCache
from jobspy.util import create_session

TAXONOMY_URL = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy/main/concepts'
SOURCES = {
    'arbetsformedlingen': 'https://jobsearch.api.jobtechdev.se/search',
    'jobadlinks': 'https://links.api.jobtechdev.se/joblinks',
}
_concepts = TTLCache(maxsize=256, ttl=86400)


def _concept(session, kind, label):
    key = (kind, label.casefold())
    if key not in _concepts:
        response = session.get(TAXONOMY_URL, params={'type': kind, 'preferred-label': label, 'limit': 100}, timeout=15)
        response.raise_for_status()
        matches = [c for c in response.json() if c.get('taxonomy/preferred-label', '').casefold() == label.casefold()]
        if len(matches) != 1:
            raise ValueError('Location must be an exact Swedish municipality name, optionally followed by Sweden.')
        _concepts[key] = matches[0]['taxonomy/id']
    return _concepts[key]


def search(source, request, proxies):
    if not proxies:
        raise ValueError('A configured VPN proxy is required.')
    if source == 'jobadlinks' and (request.is_remote or request.job_type):
        raise ValueError('JobAd Links does not support remote-only or job-type filters; clear these filters to search it.')
    session = create_session(proxies=proxies, is_tls=False)
    session.trust_env = False
    with session:
        params = {'q': request.search_term, 'limit': request.results_wanted, 'offset': request.offset,
                  'country': _concept(session, 'country', {'sweden': 'Sverige', 'denmark': 'Danmark'}[request.country])}
        if request.location and request.location.strip():
            parts = [p.strip() for p in request.location.split(',')]
            if request.country != 'sweden' or len(parts) > 2 or (len(parts) == 2 and parts[1].casefold() not in ['sweden', 'sverige']):
                raise ValueError('For these sources, use a Swedish municipality or leave Location blank for the selected country.')
            params['municipality'] = _concept(session, 'municipality', parts[0])
            # JobTech unions geographic filters: country + municipality widens to all
            # Sweden. A Swedish municipality already establishes the country.
            del params['country']
        if request.hours_old:
            params['published-after'] = request.hours_old * 60
        if request.is_remote:
            params['remote'] = 'true'
        if request.job_type:
            if request.job_type not in ['fulltime', 'parttime']:
                raise ValueError('JobSearch supports full-time and part-time filters here; clear other job types to search it.')
            params['worktime-extent'] = _concept(session, 'worktime-extent', 'Heltid' if request.job_type == 'fulltime' else 'Deltid')
        response = session.get(SOURCES[source], params=params, timeout=20)
        response.raise_for_status()
        return [_result(source, hit) for hit in response.json().get('hits', [])]


def _result(source, hit):
    addresses = hit.get('workplace_addresses') or [hit.get('workplace_address') or {}]
    locations = []
    for address in addresses:
        location = ', '.join(dict.fromkeys(v for v in [address.get('municipality') or address.get('city'), address.get('region'), address.get('country')] if v))
        if location and location not in locations:
            locations.append(location)
    links = hit.get('source_links') or []
    return {
        'site': source, 'id': str(hit['id']), 'title': hit.get('headline'),
        'company': (hit.get('employer') or {}).get('name'), 'location': '; '.join(locations) or None,
        'job_url': links[0].get('url') if links else hit.get('webpage_url'),
        'description': hit.get('brief') or (hit.get('description') or {}).get('text'),
        'date_posted': hit.get('publication_date'), 'is_remote': None,
        'job_type': {'Heltid': 'fulltime', 'Deltid': 'parttime'}.get((hit.get('working_hours_type') or {}).get('label')),
    }
