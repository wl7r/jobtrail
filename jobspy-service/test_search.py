import unittest
from unittest.mock import patch
import pandas as pd
import main


class SearchTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main.PROXIES = ["http://first:8118", "http://second:8118"]

    def test_country_is_forwarded_and_cached_separately(self):
        with patch('main.scrape_jobs', return_value=pd.DataFrame()) as scrape:
            for country in ['sweden', 'denmark']:
                response = main.search(main.SearchRequest(site_name=['indeed'], search_term='sales director', country=country, is_remote=False))
                self.assertFalse(response.cached)
                self.assertEqual(scrape.call_args.kwargs['country_indeed'], country)

    def test_failed_source_does_not_hide_official_results(self):
        with patch('main.scrape_jobs', side_effect=RuntimeError('blocked')), patch('requests.Session.send', side_effect=self.api_response):
            response = main.search(main.SearchRequest(site_name=['linkedin', 'arbetsformedlingen'], search_term='försäljningschef', location='Malmö, Sweden', is_remote=False))
            self.assertEqual(response.results[0].title, 'Försäljningschef')
            self.assertEqual(response.results[0].site, 'arbetsformedlingen')
            self.assertEqual(response.errors[0].site, 'linkedin')

    @staticmethod
    def api_response(request, **kwargs):
        import requests, json
        from urllib.parse import urlparse, parse_qs
        params = parse_qs(urlparse(request.url).query)
        if 'taxonomy' in request.url:
            label=params['preferred-label'][0]
            data=[{'taxonomy/id': 'oYPt_yRA_Smm' if label == 'Malmö' else 'i46j_HmG_v64', 'taxonomy/preferred-label': label}]
        else:
            data={'hits': [{'id':'123', 'headline':'Försäljningschef', 'employer':{'name':'Acme'}, 'workplace_address':{'municipality':'Malmö','country':'Sverige'}, 'webpage_url':'https://arbetsformedlingen.se/platsbanken/annonser/123'}]}
        response=requests.Response();response.status_code=200;response._content=json.dumps(data).encode();response.request=request
        return response

class RoutingTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main._proxy_index = 0
        main.PROXIES = ['http://one:8118', 'http://two:8118', 'http://three:8888']

    def test_short_searches_use_all_three_proxies_without_direct_fallback(self):
        with patch('main.scrape_jobs', return_value=pd.DataFrame()) as scrape:
            for term in ['a', 'b', 'c']:
                main.search(main.SearchRequest(site_name=['indeed'], search_term=term))
            self.assertEqual([c.kwargs['proxies'][0] for c in scrape.call_args_list], main.PROXIES)
        main.PROXIES = None
        with patch('main.scrape_jobs') as scrape:
            result = main.search(main.SearchRequest(site_name=['linkedin'], search_term='no-proxy'))
            scrape.assert_not_called()
            self.assertEqual(result.count, 0)
            self.assertEqual(len(result.errors), 1)

class OfficialApiTests(unittest.TestCase):
    def setUp(self):
        main._cache.clear()
        main.PROXIES = ['http://one:8118', 'http://two:8118', 'http://three:8888']

    def test_official_sources_work_while_jobspy_workers_are_occupied(self):
        from threading import Event, Lock
        from concurrent.futures import ThreadPoolExecutor
        release, busy = Event(), Event()
        entered = 0
        lock = Lock()
        def stall(**kwargs):
            nonlocal entered
            with lock:
                entered += 1
                if entered == 3:
                    busy.set()
            release.wait(2)
            return pd.DataFrame()
        with ThreadPoolExecutor(max_workers=1) as caller:
            try:
                with patch('main.SOURCE_TIMEOUT', 0.1), patch('main.scrape_jobs', side_effect=stall), patch('requests.Session.send', side_effect=SearchTests.api_response):
                    pending = caller.submit(main.search, main.SearchRequest(site_name=['linkedin', 'indeed', 'google'], search_term='busy'))
                    self.assertTrue(busy.wait(1))
                    result = main.search(main.SearchRequest(site_name=['arbetsformedlingen'], search_term='available'))
                    self.assertEqual(result.count, 1)
            finally:
                release.set()

    def test_stalled_linkedin_returns_completed_official_results(self):
        from threading import Event
        finished = Event()
        try:
            with patch('main.SOURCE_TIMEOUT', 0.05), patch('main.scrape_jobs', side_effect=lambda **kw: (finished.wait(2), pd.DataFrame())[1]), patch('requests.Session.send', side_effect=SearchTests.api_response):
                result = main.search(main.SearchRequest(site_name=['linkedin', 'arbetsformedlingen'], search_term='chef'))
                self.assertEqual(result.count, 1)
                self.assertIn('timed out', result.errors[0].message)
        finally:
            finished.set()

    def test_municipality_does_not_widen_to_the_whole_country(self):
        from urllib.parse import urlparse, parse_qs
        observed = []
        def respond(request, **kwargs):
            if 'taxonomy' not in request.url:
                observed.append(parse_qs(urlparse(request.url).query))
            return SearchTests.api_response(request, **kwargs)
        with patch('requests.Session.send', side_effect=respond):
            main.search(main.SearchRequest(site_name=['arbetsformedlingen'], search_term='chef', location='Malmö, Sweden'))
        self.assertEqual(observed[0]['municipality'], ['oYPt_yRA_Smm'])
        self.assertNotIn('country', observed[0])

    def test_jobadlinks_preserves_original_url_missing_fields_and_offset(self):
        import requests, json
        from urllib.parse import urlparse, parse_qs
        observed = []
        def respond(request, **kwargs):
            if 'taxonomy' in request.url:
                return SearchTests.api_response(request, **kwargs)
            observed.append(parse_qs(urlparse(request.url).query))
            r=requests.Response();r.status_code=200;r.request=request
            r._content=json.dumps({'hits':[{'id':'abc','headline':'Director','brief':'Short description', 'source_links':[{'url':'https://original.example/job/1'}]}]}).encode()
            return r
        with patch('requests.Session.send', side_effect=respond):
            result = main.search(main.SearchRequest(site_name=['jobadlinks'], search_term='director', offset=25, hours_old=72))
        self.assertEqual(observed[0]['offset'], ['25'])
        self.assertEqual(observed[0]['published-after'], ['4320'])
        self.assertEqual(result.results[0].job_url, 'https://original.example/job/1')
        self.assertEqual(result.results[0].description, 'Short description')
        self.assertIsNone(result.results[0].company)
        self.assertIsNone(result.results[0].location)
        self.assertFalse(result.has_more)

    def test_unsupported_links_filter_is_visible_with_other_results(self):
        with patch('requests.Session.send', side_effect=SearchTests.api_response):
            result=main.search(main.SearchRequest(site_name=['jobadlinks', 'arbetsformedlingen'], search_term='chef', is_remote=True))
        self.assertEqual(result.count, 1)
        self.assertEqual(result.errors[0].site, 'jobadlinks')


if __name__ == '__main__':
    unittest.main()
