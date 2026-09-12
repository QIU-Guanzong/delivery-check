"""Exercise the built HTTP image without cloud credentials or external services."""
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request


def docker(*args, **kwargs):
    return subprocess.check_output(['docker', *args], text=True, **kwargs).strip()


def main():
    secret = secrets.token_hex(32)
    env = {**os.environ, 'RAPIDAPI_PROXY_SECRET': secret}
    cid = docker('run', '-d', '--read-only', '--cap-drop=ALL',
                 '--security-opt=no-new-privileges', '--memory=256m', '--cpus=1',
                 '-p', '127.0.0.1::8080', '-e', 'RAPIDAPI_PROXY_SECRET',
                 'delivery-check-api:test', env=env)
    try:
        port = docker('port', cid, '8080/tcp').split(':')[-1]
        base = f'http://127.0.0.1:{port}'

        def request(path, body=None, authenticated=True):
            headers = {'Content-Type': 'application/json'}
            if authenticated:
                headers['x-rapidapi-proxy-secret'] = secret
            req = urllib.request.Request(base + path, data=body, headers=headers)
            try:
                response = urllib.request.urlopen(req, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, json.load(response)

        for attempt in range(30):
            try:
                assert request('/health', authenticated=False) == (200, {'status': 'ok'})
                break
            except (OSError, AssertionError):
                if attempt == 29:
                    raise
                time.sleep(1)

        assert docker('exec', cid, 'id', '-u') != '0'
        sample = {'requirements': [{'name': 'a.txt', 'kind': 'text', 'maxBytes': 20}],
                  'files': [{'name': 'a.txt', 'content': 'hello'}]}
        encoded = json.dumps(sample).encode()
        assert request('/v1/check', encoded, False)[0] == 401
        status, result = request('/v1/check', encoded)
        assert status == 200 and result['status'] == 'PASS'
        sample['files'] = []
        status, result = request('/v1/check', json.dumps(sample).encode())
        assert status == 200 and result['status'] == 'FAIL'
        status, result = request('/v1/check', b'{}')
        assert status == 422 and result['status'] == 'INVALID_SPEC'
        assert request('/v1/check', b'{')[0] == 400
        health = docker('exec', cid, 'node', '-e',
                        "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
        print('PASS: non-root read-only container; health, auth, PASS, FAIL, invalid contract and malformed JSON.')
    finally:
        docker('rm', '-f', cid)


if __name__ == '__main__':
    main()
