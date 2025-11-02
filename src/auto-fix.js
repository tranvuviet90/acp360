// src/auto-fix.js

// Lựa chọn bỏ qua auto-fix cho một số khu vực
const IGNORE_SELECTOR = ".magic-navigation, [data-skip-auto-fix]";
const ROOT = document.getElementById("root");
const isInsideReactRoot = (el) => ROOT && ROOT.contains(el);

const TABLE_SELECTOR = "table"; // vẫn giữ để xử lý style nếu cần

// Hàm clamp giữ lại nếu muốn xử lý style width/min-width
function clamp(tb) {
  try {
    tb.style.width = "100%";
    tb.style.maxWidth = "100%";
    tb.style.overflowX = "auto";
  } catch (err) {
    console.warn("Clamp table error:", err);
  }
}

// KHÔNG còn reparent nữa
// function wrapTable(tb) { ... } => đã loại bỏ

function fixTables(scope) {
  scope.querySelectorAll(TABLE_SELECTOR).forEach(tb => {
    if (tb.closest(IGNORE_SELECTOR)) return;
    if (isInsideReactRoot(tb)) return; // bỏ qua node React quản lý
    clamp(tb); // chỉ chỉnh style nhẹ, không di dời DOM
  });
}

function fixImages(scope) {
  scope.querySelectorAll("img").forEach(img => {
    if (img.closest(IGNORE_SELECTOR)) return;
    if (isInsideReactRoot(img)) return;
    // xử lý style an toàn, không di dời node
    img.style.maxWidth = "100%";
    img.style.height = "auto";
  });
}

function run(scope = document) {
  fixTables(scope);
  fixImages(scope);
}

// MutationObserver để fix lại khi DOM thay đổi
const obs = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest && node.closest(IGNORE_SELECTOR)) continue;
      if (isInsideReactRoot(node)) continue;
      run(node);
    }
  }
});

// Khởi chạy
run(document);
obs.observe(document.body, {
  childList: true,
  subtree: true
});
