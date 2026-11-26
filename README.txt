MY WEBSITE - QUICK GUIDE
========================

FILES
  index.html                   main page layout (you don't need to edit it)
  checkout.html                old checkout links redirect to the package builder
  content.json                 site text, prices, discounts, images, colors, fonts, inquiry settings
  css/style.css                design (rarely needed)
  css/editor.css, js/editor.js the visual editor (only used while editing)
  js/*.js                      the engine (don't edit)
  images/                      your pictures
  start-editor.py (+ .bat / .command)   starts your private editor
  backups/                     created automatically; the last 30 saved versions of content.json


1) EDIT YOUR WEBSITE VISUALLY  (recommended)
   - Windows : double-click  start-editor.bat
   - Mac     : double-click  start-editor.command   (first time: right-click > Open)
   - or run  :  python3 start-editor.py
   Needs Python 3 (free: python.org/downloads - tick "Add Python to PATH").
   Your browser opens the site with an edit bar on top:

   * Click any text and type. Select words to get a small toolbar:
     Bold, Italic, Underline, Highlight, Color, Font, Size, Clear. Buttons also have a Link box.
   * Click any image to replace it (it is copied into the images/ folder for you).
   * Hover a block (a card, FAQ question, gallery picture, service...) to move it,
     copy it, hide it or delete it. Use "+ Add ..." under a list to add one.
     In the gallery, "+ Add images" lets you pick many pictures at once.
   * Hover a section: arrows move it up/down, Hide/Show, Copy, "+ Below" adds a new
     section after it, Delete removes it. "+ Add section" (top bar) adds one at the end.
   * Services: each row has Price, Extra discount %, Max and Preselected boxes right on the page.
   * Settings (top bar): colors, fonts, button shape, logo, discount rules, PayPal / bank details.
   * Preview checkbox: see the page as visitors will. Undo / Redo are in the top bar.
   * Press SAVE (or Ctrl+S). Nothing changes on your live website until you upload the folder.

   Only you can use the editor: it runs on your computer and refuses any other address.


2) PUT THE WEBSITE ONLINE
   Upload everything EXCEPT:  start-editor.py, start-editor.bat, start-editor.command,
   js/editor.js, css/editor.css, backups/, README.txt.
   (Netlify, GitHub Pages, Cloudflare Pages or any web host work.)
   Whenever you edit again: run the editor, Save, upload content.json and any new images.

   Simple preview WITHOUT the editor: open a terminal in this folder and run
       python3 -m http.server 8000
   then visit http://localhost:8000  (double-clicking index.html does NOT work: browsers block it).


3) HOW THE PACKAGE BUILDER PRICES THINGS
   Customers set a quantity for each service. The most expensive unit is the starter and adds no
   discount. Every other unit adds its service's "Extra discount %" to ONE discount that applies to
   EVERY item in the order. Units are counted from the biggest discount down, and each next unit
   counts slightly more ("momentum"), so the more they add, the faster the discount grows.
   Maximum discount: 50% (change it in Settings > Prices and discounts).

   Example with the starting prices (Ad image $8 / +7%, Description $5 / +6%, Ad copy $4 / +5%):
     2 images + 1 description  ->  14% off  ->  $18.06 instead of $21.00
     6 images + 1 description  ->  about 46% off
   To add a service: hover the service list and press "+ Add service".
   Harder service = bigger "Extra discount %".

   "Request this package" opens a contact form in the package summary. Sending it emails you
   the selected services, current prices, total, customer details, and optional note. The website
   does not collect payment. Review the request and reply to confirm the scope and payment next steps.


3b) FLASH DEAL (extra % off the total)
   A yellow banner above the calculator. The extra % is taken off the TOTAL after the normal discount
   (it is not limited by the 50% max). Edit it in Settings > Flash deal (on / %, ends by Time, Spots or
   Both, end date, spots left); banner texts are edited right on the page.
   - Time: everyone sees the same end moment; when it passes, the deal and its discount switch off by themselves.
   - Spots: the site cannot count sales. Lower "Spots left" yourself, save, upload. At 0 the deal ends.
   - The countdown only runs while it is on screen, so it costs no speed. Untick "Show seconds" for minutes only.
   Keep the numbers true: fake timers or spots can lose customers' trust.


4) PACKAGE REQUEST EMAIL
   The request form uses the existing Web3Forms endpoint and access key in content.json.
   If you replace them, update checkout.orderForm.endpoint and checkout.orderForm.accessKey.
   A successful submission confirms that the request reached the form service; payment is arranged
   separately after you review and reply to the customer.


5) EDITING content.json BY HAND
   Still possible. Sections are listed in the order they appear on the page. Every list is made of
   { } blocks: copy one to add, delete one to remove, or add  "hidden": true  to switch it off.
   Notes starting with an underscore are comments. A missing comma/quote makes the page say it can't
   load: paste the file into jsonlint.com to find it.


6) IMAGES
   Missing pictures show a labelled placeholder; nothing breaks. See images/README.txt for the file
   names the page expects if you prefer to drop files in yourself. JPG/WebP for photos, PNG for logos,
   under about 500 KB each. Pictures are cropped to fit: keep the product in the middle.
