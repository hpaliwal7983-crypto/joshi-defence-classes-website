# Joshi Defence Classes website

Live website: https://hpaliwal7983-crypto.github.io/joshi-defence-classes-website/

- Home: the public academy website
- Student portal: /student/
- Admin portal: /admin/
- Privacy notice: /privacy.html

The site is static and hosted with GitHub Pages. The private application source repository remains separate.

Student accounts are created by the academy. Portal sign-in depends on Supabase Auth setup: the student portal needs an SMS provider, and the admin magic-link flow needs the website URL added to Supabase Auth's redirect allow list. This website does not collect web payments.
