"""Download Commons files (original or scaled) and print date/licence/physical size.
usage: fetch_commons.py <outdir> <width|0> <name>=<File:Title> ...
       fetch_commons.py <outdir> <width|0> --from-search <search.json> <name>=<index> ..."""
import sys, json, re, urllib.request, urllib.parse, os
UA = "skymap-spike/0.1 research (alexander@rulkens.com)"


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read()


out, width = sys.argv[1], int(sys.argv[2])
args = sys.argv[3:]
titles = None
if args and args[0] == '--from-search':
    titles = [p['title'] for p in json.load(open(args[1]))['query']['pages'].values()]
    args = args[2:]
for arg in args:
    name, title = arg.split('=', 1)
    if titles is not None:
        title = titles[int(title)]
    q = {'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'format': 'json'}
    if width:
        q['iiurlwidth'] = width
    p = list(json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(q)))['query']['pages'].values())[0]
    ii = p['imageinfo'][0]
    m = ii['extmetadata']
    s = re.sub('<[^>]+>', ' ', m.get('ImageDescription', {}).get('value', ''))

    def f(k):
        i = s.find(k)
        return s[i:i + 80].strip() if i >= 0 else ''
    print(name, ii['width'], ii['height'], m.get('LicenseShortName', {}).get('value'), '|', f('Datering'), '|', f('Afmetingen'), '|', ii['descriptionurl'])
    url = ii['thumburl'] if width else ii['url']
    open(os.path.join(out, name + '.jpg'), 'wb').write(get(url))
