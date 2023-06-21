declare interface LocaleOptions {
    /**
     * Name of cookie used to determine language
     */
    cookieName: string;
    /**
     * Name of query string for language override
     */
    queryName: string;
    /**
     * Name of entry in localStorage for language override
     */
    localName: string;
    /**
     * Link to API endpoint
     */
    link: string;
    /**
     * Method for getting locales from API
     */
    async func(i18n: i18n): void;
}

declare class i18n {
    static options: LocaleOptions;
    /**
     * Initialize localization
     * @param options Options for localization
     */
    static init(options?: LocaleOptions): Promise<void>;
    /**
     * Get translated string by key
     * 
     * Use after init was completed
     * @param key Key for string
     * @param values Values for insertion
     */
    static translate(key: string, values?: object): string;
    /**
     * Get translated string by key
     * 
     * Use after init was completed
     * @param key Key for string
     * @param values Values for insertion
     */
    static t(key: string, values?: object): string;
    /**
     * Get link to localized source
     * 
     * Use after init was completed
     * @param src Link to source
     */
    static link(src: string): string;
    /**
     * Get link to localized source
     * 
     * Use after init was completed
     * @param src Link to source
     */
    static l(src: string): string;
    static language: string;
    static locales: object;
};

export default i18n;