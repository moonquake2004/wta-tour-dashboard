export const url = import.meta.url;
export const base = new URL('../../data/', import.meta.url).href;
export const oneUp = new URL('../data/', import.meta.url).href;
export const docBase = document.baseURI;
