/**
 * Manages the application-wide theme (Light/Dark mode) and dynamic branding styles.
 */
export class ThemeManager {
    /**
     * @param {Object} config Dynamic branding configurations from the API.
     */
    constructor(config) {
        this.config = config;
        this.themeToggleBtn = document.getElementById('theme-toggle');
        this.themeText = document.getElementById('theme-text');
        this.body = document.body;
    }

    /**
     * Bootstraps theme settings and branding.
     */
    init() {
        this.setupBranding();
        this.setupTheme();
        this.bindEvents();
    }

    /**
     * Applies custom brand settings from config to the UI.
     */
    setupBranding() {
        const { chatbotName, primaryColor } = this.config;
        
        // 1. Update chatbot name in UI
        if (chatbotName) {
            const brandNameElem = document.getElementById('brand-name');
            const welcomeTitleElem = document.getElementById('welcome-title');
            
            if (brandNameElem) brandNameElem.textContent = chatbotName;
            if (welcomeTitleElem) welcomeTitleElem.textContent = chatbotName;
            document.title = chatbotName;
        }

        // 2. Inject custom style variables for primary colors
        if (primaryColor) {
            const rgbColor = this.hexToRgb(primaryColor);
            const styleOverride = document.createElement('style');
            styleOverride.id = 'dynamic-branding-styles';
            styleOverride.textContent = `
                :root {
                    --primary-color: ${primaryColor} !important;
                    ${rgbColor ? `--primary-color-rgb: ${rgbColor} !important;` : ''}
                }
            `;
            document.head.appendChild(styleOverride);
        }
    }

    /**
     * Initializes user light/dark theme preference from localStorage.
     */
    setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.applyTheme(savedTheme);
    }

    /**
     * Binds click events to the theme toggle.
     */
    bindEvents() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => {
                const currentTheme = this.body.classList.contains('light-mode') ? 'light' : 'dark';
                const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                this.applyTheme(nextTheme);
            });
        }
    }

    /**
     * Applies Light or Dark class structures and updates local storage.
     * @param {string} theme 'light' or 'dark'
     */
    applyTheme(theme) {
        if (theme === 'light') {
            this.body.classList.remove('dark-mode');
            this.body.classList.add('light-mode');
            if (this.themeText) this.themeText.textContent = 'Dark Mode';
            localStorage.setItem('theme', 'light');
        } else {
            this.body.classList.remove('light-mode');
            this.body.classList.add('dark-mode');
            if (this.themeText) this.themeText.textContent = 'Light Mode';
            localStorage.setItem('theme', 'dark');
        }
        
        // Re-trigger Lucide icon renders so icons update cleanly
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    /**
     * Helper to extract RGB values from HEX representations.
     * @param {string} hex Hexadecimal color string.
     * @returns {string|null} Comma separated RGB triplet string or null.
     */
    hexToRgb(hex) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        if (!result) return null;
        
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `${r}, ${g}, ${b}`;
    }
}
