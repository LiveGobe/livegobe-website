import { RequestHandler } from "express";

declare interface LocaleOptions {
    /**
     * Language used if no cookie or query exists, or as fallback if language is not supported
     */
    defaultLanguage: string;
    /**
     * Name of cookie used to determine language
     */
    cookieName: string;
    /**
     * Name of query string for language override
     */
    queryName: string;
    /**
     * Array of supported languages
     */
    supportedLanguages: string[];
    /**
     * Directory where locale files are located
     */
    directory: string;
}

declare global {
    namespace Express {
        interface Request {
            /**
             * Object containing the current locales.
             */
            locales: object;
            /**
             * Current language.
             */
            language: string;
            /**
             * Use to get a locale string by key. If the key is not found, it will return the key.
             * 
             * Include values to replace the placeholders in the locale string.
             * @param key {string} The key, pointing to the locale string, separated by dots, like `key.subkey.subsubkey`.
             * @param values {object} The values to replace the placeholders in the locale string.
             */
            t(key: string, values?: object): string;
            /**
                 * Use to get a locale string by key. If the key is not found, it will return the key.
                 * 
                 * Include values to replace the placeholders in the locale string.
                 * @param key {string} The key, pointing to the locale string, separated by dots, like `key.subkey.subsubkey`.
                 * @param values {object} The values to replace the placeholders in the locale string.
                 */
             translate(key: string, values?: object): string;
        }

        interface Response {
            locals: {
                /**
                 * Object containing the current locales.
                 */
                locales: object;
                /**
                 * Current language.
                 */
                language: string;
                /**
                 * Use to get a locale string by key. If the key is not found, it will return the key.
                 * 
                 * Include values to replace the placeholders in the locale string.
                 * @param key {string} The key, pointing to the locale string, separated by dots, like `key.subkey.subsubkey`.
                 * @param values {object} The values to replace the placeholders in the locale string.
                 */
                t(key: string, values?: object): string;
                /**
                 * Use to get a locale string by key. If the key is not found, it will return the key.
                 * 
                 * Include values to replace the placeholders in the locale string.
                 * @param key {string} The key, pointing to the locale string, separated by dots, like `key.subkey.subsubkey`.
                 * @param values {object} The values to replace the placeholders in the locale string.
                 */
                 translate(key: string, values?: object): string;
            }
        }
    }
}

export = middleware;
/**
 * Creates middleware that will determine language of request and add locales to request and res.locales objects.
 * 
 * Default options:
 * 
 * `defaultLanguage` - `"en"`
 * 
 * `cookieName` - `"lang"`
 * 
 * `queryName` - `"lang"`
 * 
 * `supportedLanguages` - `["en"]`
 * 
 * `directory` - `"./locales"`
 */
declare function middleware(options: LocaleOptions): RequestHandler;