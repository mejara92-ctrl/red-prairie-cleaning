// ===============================
// Red Prairie Cleaning
// Main JavaScript
// ===============================

// -------------------------------
// Smooth Navbar Shadow On Scroll
// -------------------------------

const navbar = document.querySelector(".navbar");

if (navbar) {
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            navbar.classList.add("navbar-scrolled");
        } else {
            navbar.classList.remove("navbar-scrolled");
        }
    });
}

// -------------------------------
// Scroll Reveal Animation
// -------------------------------

const revealElements = document.querySelectorAll(
    ".trust-card, .service-card, .gallery-item, .review-card, .team, .equipment, .area-card, .comparison-section, .expectation-card, .partner-section"
);

if ("IntersectionObserver" in window) {
    const revealOptions = {
        threshold: 0.15
    };

    const revealOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add("show");
            observer.unobserve(entry.target);
        });
    }, revealOptions);

    revealElements.forEach(element => {
        element.classList.add("hidden");
        revealOnScroll.observe(element);
    });
} else {
    revealElements.forEach(element => {
        element.classList.add("show");
    });
}

// -------------------------------
// CTA Click Tracking Placeholder
// -------------------------------

const ctaLinks = document.querySelectorAll(
    'a[href="#booking"], a[href="#services"], a[href="#before-after"], a[href="#reviews"], a[href^="tel:"], a[href^="sms:"]'
);

ctaLinks.forEach(link => {
    link.addEventListener("click", () => {
        console.log("Red Prairie CTA clicked:", link.textContent.trim());
    });
});
