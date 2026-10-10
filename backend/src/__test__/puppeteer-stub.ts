/**
 * Stands in for puppeteer-core in every test that does not mock it itself.
 *
 * Puppeteer 25 ships as ES modules only. Node loads that fine at runtime, but
 * Jest's CommonJS loader cannot, so any test that merely imports a file which
 * imports puppeteer would fail before it ran. No test here launches a real
 * browser: the ones that exercise rendering mock puppeteer with their own
 * factory, which still takes precedence over this.
 */
const launch = () => Promise.reject(new Error('puppeteer is stubbed in tests'));

export default { launch };
export { launch };
export type Browser = unknown;
