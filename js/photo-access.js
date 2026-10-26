// This preserves the existing client-side gate. It is not server authorization:
// the static HTML/password and the legacy photo API are publicly readable.
window.photoGalleryReady = new Promise(resolve => {
  const content = document.getElementById('photo-content');
  let gate;
  function unlock() {
    const template = document.getElementById('photo-dates-content');
    if (template) template.replaceWith(template.content.cloneNode(true));
    content.hidden = false;
    gate?.remove();
    try { sessionStorage.setItem('flickr_authenticated', 'true'); } catch { /* Private mode. */ }
    resolve(true);
  }
  let authenticated = false;
  try { authenticated = sessionStorage.getItem('flickr_authenticated') === 'true'; } catch { /* Show form. */ }
  if (authenticated) {
    unlock();
    return;
  }
  gate = document.createElement('section');
  gate.className = 'photo-access';
  gate.innerHTML = `<form aria-labelledby="photo-access-title">
    <h1 id="photo-access-title">Sho5 Photo Gallery</h1>
    <label for="photo-password">パスワード / Password</label>
    <input id="photo-password" name="password" type="password" autocomplete="current-password" required>
    <p class="photo-access-error" role="alert" aria-live="polite"></p>
    <button type="submit">写真を見る</button><br>
    <a href="index.html">トップへ戻る</a>
  </form>`;
  document.body.append(gate);
  const input = gate.querySelector('input');
  gate.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (input.value === 'Yakiniku') {
      input.value = '';
      unlock();
      document.querySelector('#photo-content h1, #photo-content header')?.setAttribute('tabindex', '-1');
      document.querySelector('#photo-content h1, #photo-content header')?.focus();
    } else {
      gate.querySelector('[role="alert"]').textContent = 'パスワードが違います。';
      input.setAttribute('aria-invalid', 'true');
      input.select();
    }
  });
});
