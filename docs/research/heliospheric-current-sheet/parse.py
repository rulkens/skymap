import re, json, glob, datetime
def parse(path):
    cols={}
    try: txt=open(path).read()
    except FileNotFoundError: return cols
    for m in re.finditer(r'CT\d+:(\d+)\s+((?:[-\d.]+\s+){29}[-\d.]+)', txt):
        cols[int(m.group(1))%360]=[float(x) for x in m.group(2).split()]
    return cols
starts={}
for m in re.finditer(r'CR (\d+)\s+(\d{4}):(\d\d):(\d\d) (\d\d)h', open('tilts.html').read()):
    starts[int(m.group(1))]=datetime.datetime(int(m.group(2)),int(m.group(3)),int(m.group(4)),int(m.group(5)),tzinfo=datetime.timezone.utc).timestamp()/86400
maps=[];prev=None;src={}
for cr in range(1642,2303):
    cols=parse(f'wso/WSO-R250.{cr}.txt')
    if len(cols)<72:
        alt=parse(f'wso/WSO-S.{cr}.txt')
        for k,v in alt.items(): cols.setdefault(k,v)
        src[cr]='S' if alt else 'R'
    grid=[]
    for i in range(72):  # lon = 5*i, 0..355
        c=cols.get(5*i) or (prev[i] if prev else None)
        grid.append(c)
    assert all(g is not None for g in grid), cr
    prev=grid
    maps.append({'cr':cr,'t':starts[cr],'g':[[round(x,1) for x in c] for c in grid]})
json.dump(maps,open('hcs.json','w'))
open('hcs.js','w').write('window.HCS='+json.dumps(maps)+';')  # render.html loads this via <script>
print(len(maps), 'patched:', src, 'span', maps[0]['t'], maps[-1]['t'])
