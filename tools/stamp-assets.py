#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stamp-assets.py -- re-stamp ?v= fingerprints on every /css/ and /js/ reference.

WHY THIS EXISTS
---------------
_headers serves /css/* and /js/* with:

    Cache-Control: public, max-age=31536000, immutable

"immutable" tells the browser never to revalidate -- not on a reload, not on
a hard reload. Combined with unversioned filenames, that meant a change to
js/rp-pricing-engine.js could take up to a YEAR to reach a returning
visitor: they would keep getting quoted last quarter's prices, and neither
you nor they would have any way to tell.

The fix is a content hash in the query string. Same long cache, but the URL
changes the moment the file's bytes change, so browsers fetch the new copy
immediately.

RUN THIS AFTER EVERY EDIT TO ANYTHING IN /css OR /js.

USAGE
-----
    python3 tools/stamp-assets.py     # from the repo root

It is idempotent -- running it when nothing changed rewrites nothing.
"""

import re, glob, hashlib, os

def h(path):
    return hashlib.sha1(open(path,'rb').read()).hexdigest()[:8]

assets={}
for p in glob.glob('css/*.css')+glob.glob('js/*.js'):
    assets[os.path.basename(p)]=h(p)
print("asset hashes:")
for k,v in sorted(assets.items()): print(f"   {k} -> {v}")

REF=re.compile(r'((?:href|src)=")([^"]*?/?((?:css|js)/[A-Za-z0-9._-]+\.(?:css|js)))(\?[^"]*)?(")')
n=0
for f in sorted(glob.glob('**/*.html',recursive=True)):
    s=open(f,encoding='utf-8').read()
    def sub(m):
        global n
        base=os.path.basename(m.group(3))
        if base not in assets: return m.group(0)
        n+=1
        return f"{m.group(1)}{m.group(2)}?v={assets[base]}{m.group(5)}"
    new=REF.sub(sub,s)
    if new!=s:
        open(f,'w',encoding='utf-8').write(new); print(f"  {f}")
print(f"\n{n} references versioned")
