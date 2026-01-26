// Option 1: Replace "required" with "!"
// function replaceRequired() {
//   document.querySelectorAll('[data-component-part="field-required-pill"]')
//     .forEach(el => {
//       if (el.textContent !== '!') el.textContent = '!';
//     });
// }

// Option 2: Append "!" to field type and hide required pill
function replaceRequired() {
  document.querySelectorAll('[data-component-part="field-required-pill"]')
    .forEach(requiredPill => {
      if (requiredPill.style.display === 'none') return;

      const parent = requiredPill.parentElement;
      const typePill = parent?.querySelector('[data-component-part="field-info-pill"] span');

      if (typePill && !typePill.textContent.endsWith('!')) {
        typePill.textContent = typePill.textContent + '!';
        // Option 2.1: make the color of the type pill the same as the required pill
        typePill.style.backgroundColor = getComputedStyle(requiredPill).backgroundColor;
        typePill.style.color = getComputedStyle(requiredPill).color;
      }

      requiredPill.style.display = 'none';
    });
}
//
// Option 3: Apply only to Response section
// function replaceRequired() {
//   document.querySelectorAll('.api-section').forEach(section => {
//     const heading = section.querySelector('.api-section-heading-title');
//     if (heading?.textContent !== 'Response') return;
//
//     section.querySelectorAll('[data-component-part="field-required-pill"]')
//       .forEach(requiredPill => {
//         if (requiredPill.style.display === 'none') return;
//
//         const parent = requiredPill.parentElement;
//         const typePill = parent?.querySelector('[data-component-part="field-info-pill"] span');
//
//         if (typePill && !typePill.textContent.endsWith('!')) {
//           typePill.textContent = typePill.textContent + '!';
//         }
//
//         requiredPill.style.display = 'none';
//       });
//   });
// }


replaceRequired();

const observer = new MutationObserver(replaceRequired);
observer.observe(document.body, { childList: true, subtree: true });
