
/*
 * Testing our lambda function
 */

var lambda = require('./index.js').handler

// Should Work
var application = {
  "name": "Costa Michailidis",
  "email": "costa@innovationbound.com",
  "website": "https://www.innovationbound.com",
  "linkedin": "https://www.linkedin.com/in/costamichailidis",
  "assistance": "50"
}
// The curly braces below create an object, remember ; )
lambda({body: JSON.stringify({application})}).then( console.log ).catch( console.log )

// Missing Info

// Bad Email

// Not Signed

