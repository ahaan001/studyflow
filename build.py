import pathlib, re
root = pathlib.Path(__file__).resolve().parent
src = root / 'src'
shell = (src / 'shell.html').read_text()
css = (src / 'style.css').read_text() + '\n' + (src / 'web.css').read_text()
js = 'window.SF_WEB = true;\n' + '\n'.join((src / f).read_text() for f in ['logic.js', 'core.js', 'views.js', 'actions.js', 'web.js', 'main.js'])
assert '</script' not in js.lower()
head_part, rest = shell.split('<style>', 1)
markup = rest.split('</style>', 1)[1].split('<script>', 1)[0]
head_part = head_part.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
markup = markup.replace('<div class="save-state" id="save-state"><i></i><span>Loading…</span></div>',
                        '<div class="save-state" id="save-state"><i></i><span>Loading…</span></div>\n      <div class="side-user side-foot" id="side-user" style="padding:0"></div>')
markup = markup.replace('<div class="app">', '<div class="app" hidden>', 1)
icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%231f3a73'/%3E%3Cpath d='M6 8h8.5a2.75 2.75 0 0 1 0 5.5h-5a2.75 2.75 0 0 0 0 5.5H18' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="StudyFlow plans your school week around your real free time, finds weak topics before tests, and breaks assignments into steps.">
<meta name="theme-color" content="#1f3a73">
<link rel="icon" href="{icon}">
{head_part.strip()}
<style>
:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}
{css}
</style>
</head>
<body>
<div id="auth" hidden></div>
{markup.strip()}
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>
<script>
{js}
</script>
</body>
</html>
"""
out = root / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(doc)
print(out, len(doc) // 1024, 'KB')
