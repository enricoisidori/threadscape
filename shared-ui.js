(function initThreadscapeUI() {
  const NS = (window.ThreadscapeUI = window.ThreadscapeUI || {});

  function resolveToolbar(toolbarOrSelector) {
    if (!toolbarOrSelector) {
      return (
        document.querySelector(".ts-toolbar") || document.querySelector("header")
      );
    }
    if (typeof toolbarOrSelector === "string") {
      return document.querySelector(toolbarOrSelector);
    }
    return toolbarOrSelector;
  }

  function ensureTooltipNode() {
    let tip = document.querySelector(".ts-toolbar-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "ts-toolbar-tooltip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function attachToolbarTooltips(toolbarOrSelector) {
    const toolbar = resolveToolbar(toolbarOrSelector);
    if (!toolbar) return false;

    const tip = ensureTooltipNode();
    const PAD_Y = 6;
    const PAD_X = 8;

    const hide = () => {
      tip.style.display = "none";
    };

    const show = (el) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      tip.textContent = text;
      tip.style.display = "block";

      const rect = el.getBoundingClientRect();
      let left = rect.left;
      const top = rect.bottom + PAD_Y;

      tip.style.left = left + "px";
      tip.style.top = top + "px";

      const w = tip.offsetWidth;
      left = Math.max(PAD_X, Math.min(left, window.innerWidth - w - PAD_X));
      tip.style.left = left + "px";
    };

    const targets = toolbar.querySelectorAll("[data-tip]");
    targets.forEach((el) => {
      if (el.__tsTipBound) return;
      el.__tsTipBound = true;
      el.addEventListener("mouseenter", () => show(el));
      el.addEventListener("mouseleave", hide);
      el.addEventListener("blur", hide);
    });

    if (!window.__tsToolbarTipGlobalBound) {
      window.__tsToolbarTipGlobalBound = true;
      window.addEventListener("scroll", hide, { passive: true });
      window.addEventListener("resize", hide);
      document.addEventListener("pointerdown", hide, { passive: true });
    }

    return true;
  }

  NS.attachToolbarTooltips = attachToolbarTooltips;
})();

