# Joshi Defence Classes website

Live website: https://hpaliwal7983-crypto.github.io/joshi-defence-classes-website/

- Home: the public academy website
- Student portal: /student/
- Admin portal: /admin/
- Student demo: /student/?demo=student
- Admin demo: /admin/?demo=admin
- Privacy notice: /privacy.html

The student and admin demos use local sample records in the browser. You can try tests, PDFs, private live-class questions, and the owner approval workflow for a sample batch request. The QR in demo mode is marked NOT PAYABLE. No SMS, payment, or production database changes happen in demo mode; changes stay in that browser.

Real accounts use Supabase Auth and the academy database. SMS OTP still depends on the academy's configured SMS provider. Production manual UPI requests require the payment migration and server functions to be deployed; an owner must verify each UTR in the payment app before approving access. The website does not process card or store billing.
