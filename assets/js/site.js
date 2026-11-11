(() => {
  const data = JSON.parse(document.getElementById('site-data').textContent);
  const hours = data.hours;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const clock = (mins) => {
    const h = Math.floor(mins / 60), m = mins % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return (m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`) + (h >= 12 ? ' pm' : ' am');
  };

  // The restaurant's clock, whatever timezone the visitor is in.
  function sydneyNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      dayIndex: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday),
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }
  const dayIndexOf = (isoDate) => (new Date(isoDate + 'T12:00:00Z').getUTCDay() + 6) % 7;

  // Open-now status and today's row in the hours table
  const now = sydneyNow();
  const today = hours[now.dayIndex];
  let label, open = false;
  if (now.minutes >= toMinutes(today.open) && now.minutes < toMinutes(today.close)) {
    open = true;
    label = toMinutes(today.close) - now.minutes <= 45 ? `Closing soon, at ${clock(toMinutes(today.close))}` : `Open now until ${clock(toMinutes(today.close))}`;
  } else if (now.minutes < toMinutes(today.open)) {
    label = `Closed now. Opens today at ${clock(toMinutes(today.open))}`;
  } else {
    const next = hours[(now.dayIndex + 1) % 7];
    label = `Closed now. Opens tomorrow at ${clock(toMinutes(next.open))}`;
  }
  $$('[data-open-status]').forEach((el) => {
    el.textContent = label;
    el.classList.add(open ? 'is-open' : 'is-closed');
  });
  $(`.hours [data-day="${now.dayIndex}"]`)?.classList.add('is-today');
  $$('[data-year]').forEach((el) => { el.textContent = now.date.slice(0, 4); });

  // Mobile navigation
  const toggle = $('.nav-toggle'), nav = $('#main-nav');
  toggle?.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen);
  });
  nav?.addEventListener('click', (e) => {
    if (e.target.closest('a')) { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
  });

  // Booking form
  const form = $('.book-form');
  if (form) {
    const date = form.elements.date, time = form.elements.time, guests = form.elements.guests;
    const occasion = form.elements.occasion;
    const hint = $('[data-banquet-hint]'), done = $('.book-done'), formError = $('.form-error', form);
    const maxDate = new Date(now.date + 'T12:00:00Z');
    maxDate.setUTCDate(maxDate.getUTCDate() + 90);
    date.min = now.date;
    date.max = maxDate.toISOString().slice(0, 10);

    function fillTimes() {
      const previous = time.value;
      if (!date.value) { time.innerHTML = '<option value="">Choose a date first</option>'; return; }
      const day = hours[dayIndexOf(date.value)];
      const last = toMinutes(day.close) - data.booking.lastBookingMinutesBeforeClose;
      const earliest = date.value === now.date ? sydneyNow().minutes + 120 : 0;
      const slots = [];
      for (let m = toMinutes(day.open); m <= last; m += data.booking.slotMinutes) if (m >= earliest) slots.push(m);
      time.innerHTML = slots.length
        ? '<option value="">Choose a time</option>' + slots.map((m) => `<option>${clock(m)}</option>`).join('')
        : `<option value="">No online times left today. Call ${data.phone}</option>`;
      if ([...time.options].some((o) => o.value === previous)) time.value = previous;
    }
    date.addEventListener('change', fillTimes);

    function syncGuests() { hint.hidden = !(Number(guests.value) >= 5 && occasion.value !== 'Set banquet'); }
    $$('.stepper button', form).forEach((btn) => btn.addEventListener('click', () => {
      const next = Math.min(Number(guests.max), Math.max(1, (Number(guests.value) || 1) + Number(btn.dataset.step)));
      guests.value = next;
      syncGuests();
    }));
    guests.addEventListener('input', syncGuests);
    occasion.addEventListener('change', syncGuests);
    $$('[data-occasion]').forEach((a) => a.addEventListener('click', () => {
      occasion.value = a.dataset.occasion;
      if (Number(guests.value) < 5) guests.value = 5;
      syncGuests();
    }));

    const rules = {
      date: (v) => !v ? 'Choose a date.' : (v < date.min ? 'Choose today or a later date.' : (v > date.max ? 'Online bookings open 90 days ahead. Call us for later dates.' : '')),
      time: (v) => v ? '' : (date.value ? 'Choose a time.' : 'Choose a date, then a time.'),
      guests: (v) => {
        const n = Number(v);
        if (!n || n < 1) return 'Enter how many guests.';
        return n > Number(guests.max) ? `For more than ${guests.max} guests, call ${data.phone}.` : '';
      },
      name: (v) => v.trim().length >= 2 ? '' : 'Enter your name.',
      phone: (v) => v.replace(/\D/g, '').length >= 8 ? '' : 'Enter a phone number we can call to confirm.',
      email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Check the email address, or leave it empty.'
    };
    function check(name) {
      const field = form.elements[name], message = rules[name](field.value);
      $(`[data-error-for="${name}"]`, form).textContent = message;
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      return !message;
    }
    Object.keys(rules).forEach((name) => form.elements[name].addEventListener('blur', () => {
      if (form.elements[name].value || form.elements[name].getAttribute('aria-invalid') === 'true') check(name);
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const invalid = Object.keys(rules).filter((name) => !check(name));
      if (invalid.length) { form.elements[invalid[0]].focus(); return; }
      const button = $('button[type="submit"]', form);
      button.disabled = true;
      button.textContent = 'Sending your request';
      formError.hidden = true;
      const isPreview = data.demo || ['localhost', '127.0.0.1', ''].includes(location.hostname);
      $('[data-demo-note]').hidden = !isPreview;
      try {
        if (!isPreview) {
          const res = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(new FormData(form)).toString()
          });
          if (!res.ok) throw new Error(res.status);
        }
        const nice = new Date(date.value + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
        $('[data-done-summary]').textContent = `${form.elements.name.value.trim()}, table for ${guests.value} on ${nice} at ${time.value}.`;
        form.hidden = true;
        done.hidden = false;
        done.focus();
      } catch (err) {
        formError.textContent = `Your request did not send. Check your connection and try again, or call ${data.phone}.`;
        formError.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = 'Request booking';
      }
    });
    $('[data-book-again]').addEventListener('click', () => {
      form.reset(); fillTimes(); syncGuests();
      done.hidden = true; form.hidden = false; date.focus();
    });
  }

  // Gallery lightbox
  const lightbox = $('.lightbox');
  if (lightbox) {
    const shots = $$('.shot'), img = $('img', lightbox);
    let index = 0;
    const show = (i) => {
      index = (i + shots.length) % shots.length;
      img.src = shots[index].dataset.full;
      img.alt = $('img', shots[index]).alt;
    };
    shots.forEach((shot, i) => shot.addEventListener('click', () => { show(i); lightbox.showModal(); }));
    $('.lightbox-close').addEventListener('click', () => lightbox.close());
    $('.lightbox-prev').addEventListener('click', () => show(index - 1));
    $('.lightbox-next').addEventListener('click', () => show(index + 1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
    lightbox.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
  }

  // Map loads only when asked, to keep the page fast
  const map = $('.map');
  map?.querySelector('button').addEventListener('click', () => {
    map.innerHTML = `<iframe src="${map.dataset.map}" title="Map showing Frank’s Lebanese Restaurant" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  });

  // Menu page: section chips, search and vegetarian filter
  const chips = $$('.chips a');
  if (chips.length) {
    const sections = $$('.menu-section'), search = $('#menu-search'), veg = $('#veg-only'), empty = $('.menu-empty');
    const setCurrent = (id) => chips.forEach((chip) => {
      const on = chip.getAttribute('href') === '#' + id;
      chip.classList.toggle('is-current', on);
      if (on) chip.parentElement.scrollTo({ left: chip.offsetLeft - 40 });
    });
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setCurrent(entry.target.id); });
    }, { rootMargin: '-30% 0px -65% 0px' });
    sections.forEach((s) => spy.observe(s));

    function filter() {
      const q = search.value.trim().toLowerCase();
      let total = 0;
      sections.forEach((section) => {
        let shown = 0;
        $$('.dish, .dish-line', section).forEach((item) => {
          const match = (!q || item.dataset.search.includes(q)) && (!veg.checked || item.dataset.veg === '1');
          item.hidden = !match;
          if (match) shown++;
        });
        $$('.drink-groups > div', section).forEach((g) => { g.hidden = !$$('.dish-line:not([hidden])', g).length; });
        section.hidden = !shown;
        $(`.chips a[href="#${section.id}"]`).hidden = !shown;
        total += shown;
      });
      empty.hidden = total > 0;
    }
    search.addEventListener('input', filter);
    veg.addEventListener('change', filter);
  }
})();
