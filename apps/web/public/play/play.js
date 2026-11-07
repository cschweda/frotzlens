// frotzlens's player page. It runs in a sandboxed iframe with no allow-same-origin: an opaque origin,
// cut off from the app, its storage and everything else on the site. A story is anyone's file, and
// ZVM compiles it to JavaScript as it runs, so even a story that broke out of the interpreter would be
// stuck in here.
//
// The story arrives by postMessage from the parent (the only window that may send it), as bytes and
// its Z-machine version. It's turned into a blob URL in this page's own origin, and Parchment is
// started on it. One story per page load: frotzlens reloads the frame to play another.
(function () {
  'use strict'
  var params = new URLSearchParams(location.search)
  if (params.get('theme') === 'dark') document.documentElement.classList.add('frotz-dark')

  var started = false
  window.addEventListener('message', function (e) {
    if (started || e.source !== window.parent) return
    var d = e.data
    if (!d || d.source !== 'frotzlens' || d.type !== 'story') return
    if (!(d.bytes instanceof ArrayBuffer) || d.bytes.byteLength < 64 || d.bytes.byteLength > 16 * 1024 * 1024) return
    var version = Number(d.version)
    if ([3, 4, 5, 8].indexOf(version) < 0) return
    started = true
    var url = URL.createObjectURL(new Blob([d.bytes], { type: 'application/octet-stream' }))
    // Parchment picks the interpreter from the URL's extension; the #fragment isn't fetched.
    window.parchment_options = { default_story: [url + '#game.z' + version], lib_path: 'web/' }
    var s = document.createElement('script')
    s.type = 'module'
    s.src = 'web/main.js'
    // If the player itself can't load, say so instead of leaving a blank frame.
    s.onerror = function () {
      document.getElementById('errorcontent').textContent = 'The player could not be loaded. Reload the page to try again.'
      document.getElementById('errorpane').style.display = ''
    }
    document.body.appendChild(s)
  })

  // Ready for the story. '*': this page's origin is opaque, and the message carries nothing but "ready".
  window.parent.postMessage({ source: 'frotzlens-play', type: 'ready' }, '*')
})()
