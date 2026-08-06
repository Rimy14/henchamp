import express from "express";


import {
    createTicketPayment
}
from "../services/ticketing/ticket-payment-create.service.js";


const router =
express.Router();



router.post(
    "/stk",
    async(req,res)=>{


        const result =
        await createTicketPayment(
            req.body
        );


        res.json(result);

    }
);



export default router;