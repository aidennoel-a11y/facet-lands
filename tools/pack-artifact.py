import re, glob, os, shutil
import sys
root='dist'; out=sys.argv[1] if len(sys.argv) > 1 else 'artifact'
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
html=open(root+'/index.html').read()
css=open(glob.glob(root+'/assets/index-*.css')[0]).read()
body=re.search(r'<body>(.*)</body>', html, re.S).group(1)
page='<title>Facet Lands</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500&display=swap" />\n<style>'+css+'</style>\n'+body.strip()+'\n<script type="module" src="app.js"></script>\n'
open(out+'/index.html','w').write(page)
shutil.copy(glob.glob(root+'/assets/index-*.js')[0], out+'/app.js')
for f in glob.glob(root+'/assets/*Worker-*.js'): shutil.copy(f, out+'/'+os.path.basename(f))
print(os.listdir(out))
