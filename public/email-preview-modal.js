// Email Preview Modal Script
// Adds a "See Example Email" button and displays the email preview in a centered modal.

document.addEventListener('DOMContentLoaded', function () {
    // ----- Modal HTML -----
    const modalHTML = `
        <div id="email-modal" class="modal-overlay">
            <div class="modal-content">
                <!-- Close button removed as requested -->
                <iframe id="email-preview-iframe" src="email-preview.html" class="email-iframe"></iframe>
            </div>
        </div>
    `;

    // ----- Styles -----
    const styleHTML = `
        <style>
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.75);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                padding: 0;
            }
            .modal-overlay.active { display: flex; }
            .modal-content {
                background: white;
                width: 80vw;
                max-width: 800px;
                height: 80vh; 
                max-height: 90vh;
                border-radius: 1rem;
                
                /* ADDED: Horizontal padding, removed vertical padding */
                padding: 0 2rem; 
                box-sizing: border-box; /* Ensures padding doesn't expand width */
                
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                overflow: hidden; 
                position: relative;
                display: flex;
                flex-direction: column;
            }
            .email-iframe {
                width: 100%;
                height: 100%;
                flex-grow: 1;
                border: none;
                background: #f8fafc;
            }
            .email-preview-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem 1.5rem;
                background: linear-gradient(to right, #10b981, #0d9488);
                color: white;
                border-radius: 9999px;
                font-weight: 600;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
                box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2);
            }
            .email-preview-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 15px -3px rgba(16,185,129,0.3);
            }
            .email-preview-btn svg { width: 1.25rem; height: 1.25rem; }
        </style>
    `;

    // Insert styles and modal into the document
    document.head.insertAdjacentHTML('beforeend', styleHTML);
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // ----- Add button after the "How RefundMyRail Works" heading -----
    const heading = document.querySelector('h2');
    if (heading && heading.textContent.includes('How RefundMyRail Works')) {
        const buttonHTML = `
            <button id="email-preview-btn" class="email-preview-btn">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                See Example Email
            </button>
        `;
        heading.parentElement.insertAdjacentHTML('beforeend', buttonHTML);
        // Center the button container
        const btn = document.getElementById('email-preview-btn');
        if (btn) {
            btn.parentElement.style.display = 'flex';
            btn.parentElement.style.flexDirection = 'column';
            btn.parentElement.style.alignItems = 'center';
            btn.parentElement.style.gap = '1rem';
        }
    }

    // ----- Modal functionality -----
    const modal = document.getElementById('email-modal');
    const openBtn = document.getElementById('email-preview-btn');

    if (openBtn) {
        openBtn.addEventListener('click', function () {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close on overlay click
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});