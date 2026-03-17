let isLoginMode = true;
const STORAGE_KEY = 'lang';
const FALLBACK_LANG = 'en';

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
});

function getDict(lang) {
    const dict = window.I18N || {};
    return dict[lang] || dict[FALLBACK_LANG] || {};
}

function getLang() {
    const saved = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
    if (saved && window.I18N && window.I18N[saved]) return saved;

    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (nav && window.I18N && window.I18N[nav]) return nav;

    return FALLBACK_LANG;
}

function t(key) {
    const lang = getLang();
    const dict = getDict(lang);
    if (key in dict) return dict[key];

    const fb = getDict(FALLBACK_LANG);
    if (key in fb) return fb[key];

    return key;
}

function applyAuthI18n() {
    document.documentElement.setAttribute('lang', getLang());
    document.title = t('auth.pageTitle');

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        el.textContent = t(key);
    });

    updateModeUI();
    updateLangButtons();
}

function setLang(lang) {
    const next = (lang || '').toLowerCase();
    if (!window.I18N || !window.I18N[next]) return;
    localStorage.setItem(STORAGE_KEY, next);
    applyAuthI18n();
}

function updateLangButtons() {
    const ruBtn = document.getElementById('langRuBtn');
    const enBtn = document.getElementById('langEnBtn');
    const lang = getLang();

    if (ruBtn) {
        ruBtn.classList.toggle('active', lang === 'ru');
        ruBtn.setAttribute('aria-pressed', String(lang === 'ru'));
    }
    if (enBtn) {
        enBtn.classList.toggle('active', lang === 'en');
        enBtn.setAttribute('aria-pressed', String(lang === 'en'));
    }
}

function initializeAuth() {
    const authForm = document.getElementById('authForm');
    const switchLink = document.getElementById('switchLink');
    const langRuBtn = document.getElementById('langRuBtn');
    const langEnBtn = document.getElementById('langEnBtn');
    
    // Check if already logged in (only check, don't redirect immediately)
    const token = localStorage.getItem('token');
    const currentUser = localStorage.getItem('currentUser');
    
    // Only redirect if we have both token and user data
    if (token && currentUser) {
        // Verify token is not expired by attempting to parse user data
        try {
            JSON.parse(currentUser);
            // Small delay to avoid redirect loops
            setTimeout(() => {
                window.location.replace('index.html');
            }, 100);
            return;
        } catch (e) {
            // Invalid user data, clear storage
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
        }
    }
    
    authForm.addEventListener('submit', handleSubmit);
    switchLink.addEventListener('click', toggleMode);
    if (langRuBtn) langRuBtn.addEventListener('click', () => setLang('ru'));
    if (langEnBtn) langEnBtn.addEventListener('click', () => setLang('en'));

    updateModeUI();
    applyAuthI18n();
}

function updateModeUI() {
    const usernameGroup = document.getElementById('usernameGroup');
    const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
    const usernameInput = document.getElementById('username');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');
    const switchText = document.getElementById('switchText');
    const switchLink = document.getElementById('switchLink');
    
    if (isLoginMode) {
        usernameGroup.style.display = 'none';
        confirmPasswordGroup.style.display = 'none';
        if (usernameInput) {
            usernameInput.required = false;
            usernameInput.disabled = true;
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.required = false;
            confirmPasswordInput.disabled = true;
        }
        submitBtn.textContent = t('auth.loginBtn');
        switchText.textContent = t('auth.needAccount');
        switchLink.textContent = t('auth.registerLink');
        document.querySelector('.logo h1').textContent = t('auth.welcomeBack');
        document.querySelector('.logo p').textContent = t('auth.welcomeSubtitle');
    } else {
        usernameGroup.style.display = 'block';
        confirmPasswordGroup.style.display = 'block';
        if (usernameInput) {
            usernameInput.required = true;
            usernameInput.disabled = false;
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.required = true;
            confirmPasswordInput.disabled = false;
        }
        submitBtn.textContent = t('auth.registerBtn');
        switchText.textContent = t('auth.haveAccount');
        switchLink.textContent = t('auth.loginLink');
        document.querySelector('.logo h1').textContent = t('auth.createAccount');
        document.querySelector('.logo p').textContent = t('auth.createSubtitle');
    }
}

function toggleMode(e) {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    updateModeUI();
    
    // Clear any error messages
    removeMessage('error-message');
    removeMessage('success-message');
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (!isLoginMode) {
        if (!username || username.trim().length < 3) {
            showError(t('auth.error.usernameMin'));
            return;
        }
        
        if (password !== confirmPassword) {
            showError(t('auth.error.passwordMismatch'));
            return;
        }
    }
    
    if (!email || !validateEmail(email)) {
        showError(t('auth.error.invalidEmail'));
        return;
    }
    
    if (!password || password.length < 6) {
        showError(t('auth.error.passwordMin'));
        return;
    }
    
    if (isLoginMode) {
        await login(email, password);
    } else {
        await register(username, email, password);
    }
}

async function login(email, password) {
    try {
        const apiUrl = window.APP_CONFIG?.API_URL || '';
        const response = await fetch(`${apiUrl}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showError(data.error || t('auth.error.loginFailed'));
            return;
        }
        
        // Save token and user data
        localStorage.setItem('token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        showSuccess(t('auth.success.login'));
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        console.error('Login error:', error);
        showError(t('auth.error.network'));
    }
}

async function register(username, email, password) {
    try {
        const apiUrl = window.APP_CONFIG?.API_URL || '';
        const response = await fetch(`${apiUrl}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showError(data.error || t('auth.error.registrationFailed'));
            return;
        }
        
        // Save token and user data
        localStorage.setItem('token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        showSuccess(t('auth.success.registration'));
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        console.error('Registration error:', error);
        showError(t('auth.error.network'));
    }
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showError(message) {
    removeMessage('error-message');
    removeMessage('success-message');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message show';
    errorDiv.textContent = message;
    
    const form = document.getElementById('authForm');
    form.insertBefore(errorDiv, form.firstChild);
}

function showSuccess(message) {
    removeMessage('error-message');
    removeMessage('success-message');
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message show';
    successDiv.textContent = message;
    
    const form = document.getElementById('authForm');
    form.insertBefore(successDiv, form.firstChild);
}

function removeMessage(className) {
    const existingMessage = document.querySelector('.' + className);
    if (existingMessage) {
        existingMessage.remove();
    }
}
