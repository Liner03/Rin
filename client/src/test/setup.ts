import { JSDOM } from "jsdom";

if (typeof document === "undefined") {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });

  Object.defineProperties(window.HTMLElement.prototype, {
    attachEvent: {
      configurable: true,
      value: () => undefined,
    },
    detachEvent: {
      configurable: true,
      value: () => undefined,
    },
  });

  Object.assign(globalThis, {
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    Element: window.Element,
    Node: window.Node,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    history: window.history,
    Event: window.Event,
    PopStateEvent: window.PopStateEvent,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    navigator: window.navigator,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}
