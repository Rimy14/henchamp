/**
 * Ticket payment completion
 *
 * This is an integration hook for the external
 * ticketing platform.
 *
 * The HenChamp system confirms payment only.
 * Actual ticket issuing happens in the ticket platform.
 */


export async function completeTicketPayment(payment){


    console.log(
        "Ticket payment completed:",
        payment.reference
    );


    /*
       Future integration:

       1. Call ticket platform API
       2. Mark ticket paid
       3. Generate ticket/QR
       4. Send customer confirmation

    */


    return {

        success:true,

        reference:
        payment.reference,

        receipt:
        payment.mpesa_receipt

    };

}