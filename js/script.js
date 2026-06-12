// ===============================
// Red Prairie Cleaning 2.0
// Main JavaScript
// ===============================


// -------------------------------
// Instant Estimate Calculator
// -------------------------------

const bedrooms = document.getElementById("bedrooms");
const bathrooms = document.getElementById("bathrooms");
const serviceType = document.getElementById("service-type");
const priceDisplay = document.getElementById("price");
const addOns = document.querySelectorAll(".checkbox-group input");

function calculatePrice() {
    let basePrice = 149;

    const bedroomValue = bedrooms.value;
    const bathroomValue = bathrooms.value;
    const serviceValue = serviceType.value;

    if (bedroomValue === "2") basePrice += 30;
    if (bedroomValue === "3") basePrice += 60;
    if (bedroomValue === "4") basePrice += 90;
    if (bedroomValue === "5+") basePrice += 130;

    if (bathroomValue === "2") basePrice += 25;
    if (bathroomValue === "3") basePrice += 50;
    if (bathroomValue === "4+") basePrice += 80;

    if (serviceValue === "Deep Cleaning") basePrice += 100;
    if (serviceValue === "Move-Out Cleaning") basePrice += 150;
    if (serviceValue === "Carpet Cleaning") basePrice = 149;

    addOns.forEach(addOn => {
        if (addOn.checked) {
            basePrice += 35;
        }
    });

    priceDisplay.textContent = `$${basePrice}+`;
}

if (bedrooms && bathrooms && serviceType && priceDisplay) {
    bedrooms.addEventListener("change", calculatePrice);
    bathrooms.addEventListener("change", calculatePrice);
    serviceType.addEventListener("change", calculatePrice);

    addOns.forEach(addOn => {
        addOn.addEventListener("change", calculatePrice);
    });

    calculatePrice();
}


// -------------------------------
// Smooth Navbar Shadow On Scroll
// -------------------------------

const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
        navbar.classList.add("navbar-scrolled");
    } else {
        navbar.classList.remove("navbar-scrolled");
    }
});


// -------------------------------
// Scroll Reveal Animation
// -------------------------------

const revealElements = document.querySelectorAll(
    ".trust-card, .service-card, .gallery-item, .review-card, .team, .equipment, .area-card"
);

const revealOptions = {
    threshold: 0.15
};

const revealOnScroll = new IntersectionObserver(function(entries, observer) {
    entries.forEach(entry => {
        if (!entry.isIntersecting) {
            return;
        }

        entry.target.classList.add("show");
        observer.unobserve(entry.target);
    });
}, revealOptions);

revealElements.forEach(element => {
    element.classList.add("hidden");
    revealOnScroll.observe(element);
});


// -------------------------------
// Booking Button Tracking Placeholder
// -------------------------------

const bookingLinks = document.querySelectorAll('a[href="#booking"], a[href="#calculator"]');

bookingLinks.forEach(link => {
    link.addEventListener("click", () => {
        console.log("Red Prairie CTA clicked:", link.textContent.trim());
    });
});


// -------------------------------
// Future GoHighLevel Hook
// -------------------------------
// When we embed the GHL calendar/form, we can
// pass estimate data into hidden fields later.

function getEstimateData() {
    return {
        bedrooms: bedrooms ? bedrooms.value : null,
        bathrooms: bathrooms ? bathrooms.value : null,
        service: serviceType ? serviceType.value : null,
        estimate: priceDisplay ? priceDisplay.textContent : null
    };
}
