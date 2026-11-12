(function () {
  'use strict';

  // Find the executing script tag to extract workspace slug
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  if (!currentScript) return;

  var workspaceSlug = currentScript.getAttribute('data-workspace');
  if (!workspaceSlug) {
    console.error('[AnswerDesk] Missing data-workspace attribute on script tag.');
    return;
  }

  // Derive host origin from script src (e.g. https://answerdesk.app or http://localhost:3000)
  var scriptUrl = new URL(currentScript.src, window.location.href);
  var appHost = scriptUrl.origin;

  // Retrieve or create persistent visitor ID in localStorage
  var storageKey = 'answerdesk_visitor_id';
  var visitorId;
  try {
    visitorId = localStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId = 'vis_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem(storageKey, visitorId);
    }
  } catch {
    visitorId = 'vis_' + Math.random().toString(36).substring(2, 15);
  }

  // Container
  var container = document.createElement('div');
  container.id = 'answerdesk-widget-container';
  container.style.position = 'fixed';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.zIndex = '2147483647';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

  // Launcher Button
  var button = document.createElement('button');
  button.id = 'answerdesk-launcher-btn';
  button.setAttribute('aria-label', 'Open support chat');
  button.style.width = '56px';
  button.style.height = '56px';
  button.style.borderRadius = '50%';
  button.style.backgroundColor = '#18181b';
  button.style.color = '#ffffff';
  button.style.border = '1px solid #27272a';
  button.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
  button.style.cursor = 'pointer';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.transition = 'transform 0.2s ease, background-color 0.2s ease';
  button.style.outline = 'none';

  // Chat Bubble Icon (SVG)
  button.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
    '</svg>';

  // Iframe
  var iframe = document.createElement('iframe');
  iframe.id = 'answerdesk-chat-iframe';
  var hostOrigin = window.location.origin;
  iframe.src =
    appHost +
    '/widget/' +
    encodeURIComponent(workspaceSlug) +
    '?visitorId=' +
    encodeURIComponent(visitorId) +
    '&hostOrigin=' +
    encodeURIComponent(hostOrigin);
  iframe.title = 'Support Chat';
  iframe.style.display = 'none';
  iframe.style.position = 'absolute';
  iframe.style.bottom = '70px';
  iframe.style.right = '0';
  iframe.style.width = '380px';
  iframe.style.height = '560px';
  iframe.style.maxWidth = 'calc(100vw - 32px)';
  iframe.style.maxHeight = 'calc(100vh - 100px)';
  iframe.style.border = '1px solid #e4e4e7';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.16)';
  iframe.style.backgroundColor = '#ffffff';
  iframe.style.overflow = 'hidden';

  var isOpen = false;

  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.display = 'block';
      button.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line>' +
        '<line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>';
    } else {
      iframe.style.display = 'none';
      button.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
        '</svg>';
    }
  }

  button.addEventListener('click', toggleWidget);

  // Listen for close events securely from the embedded AnswerDesk iframe only
  window.addEventListener('message', function (event) {
    // 1. Origin verification: must match the AnswerDesk app host origin
    if (event.origin !== appHost) return;
    // 2. Source verification: must originate strictly from the widget iframe
    if (iframe.contentWindow && event.source !== iframe.contentWindow) return;

    if (event.data === 'answerdesk:close' || (event.data && event.data.type === 'answerdesk:close')) {
      if (isOpen) toggleWidget();
    }
  });

  container.appendChild(iframe);
  container.appendChild(button);
  document.body.appendChild(container);
})();
