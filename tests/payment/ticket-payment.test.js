import {
    createTicketPayment
}
from "../../server/services/ticketing/ticket-payment-create.service.js";


const result =
await createTicketPayment({

    phone:"254712345001",

    amount:500

});


console.log(result);