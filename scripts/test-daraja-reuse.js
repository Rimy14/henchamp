import {
createDarajaPayment
}
from '../server/services/payment/daraja/daraja.service.js';



const result =
await createDarajaPayment({

amount:500,

phone:'254712345678',

accountReference:'TICKET-001',

transactionDesc:'Concert Ticket',

metadata:{
platform:'ticketing'
}

});


console.log(result);