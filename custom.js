function replaceRequired() {
  // replaces the word "required" with "!" in all elements with data-component-part="field-required-pill"
  document.querySelectorAll('[data-component-part="field-required-pill"]')
    .forEach(el => {
      if (el.textContent !== '!') el.textContent = '!';
    });
}

replaceRequired();

const observer = new MutationObserver(replaceRequired);
observer.observe(document.body, { childList: true, subtree: true });
