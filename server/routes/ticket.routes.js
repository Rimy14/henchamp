import express from "express";


import {
    createTicketPayment
}
from '../services/ticketing/ticket-payment-create.service.js';


const router =
express.Router();



router.post(
"/ticket/payment",
async(req,res)=>{


try{


const result =
await createTicketPayment(
req.body
);



res.json(result);



}
catch(error){


res.status(500)
.json({

success:false,

message:error.message

});


}


});



export default router;