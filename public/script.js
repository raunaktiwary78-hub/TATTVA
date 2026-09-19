const menu=document.getElementById('menu'),links=document.getElementById('links');menu.addEventListener('click',()=>links.classList.toggle('open'));document.querySelectorAll('#links a').forEach(a=>a.addEventListener('click',()=>links.classList.remove('open')));
const form = document.getElementById("contactForm");
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("formStatus");
    const data = Object.fromEntries(new FormData(form).entries());
    status.textContent = "Sending...";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send.");
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.textContent = error.message + " You can email raunaktiwary78@gmail.com directly.";
    }
  });
}
