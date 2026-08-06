import api from '../api.js';
import toast from '../toast.js';

let lastPOSReference = null;


// ===============================
// HELPERS
// ===============================

function escapeHtml(value){

    return String(value ?? '')
        .replace(/[&<>"'/]/g, char => ({
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#39;',
            '/':'&#x2F;'
        })[char]);

}



function formatDate(value){

    if(!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleString();

}



// ===============================
// PAYMENT HISTORY
// ===============================

async function loadHistory(){

    const body =
        document.getElementById(
            'ispPaymentsHistoryBody'
        );


    if(!body) return;


    try{


        const result =
            await api.get(
                '/payment/isp'
            );


        const rows =
            result.data || result;



        if(!Array.isArray(rows) || rows.length === 0){

            body.innerHTML = `
            <tr>
                <td colspan="6">
                    No payment records found.
                </td>
            </tr>
            `;

            return;
        }



        body.innerHTML =
        rows.map(payment => `

        <tr>

            <td>
            ${escapeHtml(
                payment.reference ||
                payment.transaction_reference ||
                payment.checkout_request_id ||
                ''
            )}
            </td>


            <td>
            ${escapeHtml(
                (
                payment.provider ||
                payment.payment_provider ||
                ''
                ).toUpperCase()
            )}
            </td>


            <td>
            ${escapeHtml(
                payment.subscriber_id ||
                ''
            )}
            </td>


            <td>
            ${escapeHtml(
                payment.amount
            )}
            </td>


            <td>
            ${escapeHtml(
                payment.status ||
                ''
            )}
            </td>


            <td>
            ${formatDate(
                payment.created_at
            )}
            </td>


        </tr>

        `).join('');



    }
    catch(error){


        console.error(
            'Payment history error:',
            error
        );


        body.innerHTML = `
        <tr>
            <td colspan="6">
                Payment history API unavailable.
            </td>
        </tr>
        `;

    }

}



// ===============================
// M-PESA DAR AJA
// ===============================

async function sendSTK(){


    const payload = {

        subscriberId:
        document.getElementById('mpSubId')?.value.trim() || null,


        saleId:
        document.getElementById('mpSaleId')?.value.trim() || null,


        phone:
        document.getElementById('mpPhone')?.value.trim(),


        amount:
        document.getElementById('mpAmount')?.value.trim()

    };



    if(!payload.phone || !payload.amount){

        toast.error(
            'Phone and amount required'
        );

        return;
    }



    try{


        const response =
            await api.post(
                '/payment/mpesa/stk',
                payload
            );


        document.getElementById(
            'mpResponse'
        ).innerHTML =
        `
        <pre>
        ${escapeHtml(
            JSON.stringify(
                response,
                null,
                2
            )
        )}
        </pre>
        `;


        toast.success(
            'M-Pesa STK request sent'
        );


        loadHistory();


    }
    catch(error){

        console.error(error);

        toast.error(
            error.message
        );

    }

}



// ===============================
// PAYSTACK
// ===============================

async function initPaystack(){


    const payload = {

        subscriberId:
        document.getElementById('psSubId')?.value.trim() || null,


        saleId:
        document.getElementById('psSaleId')?.value.trim() || null,


        email:
        document.getElementById('psEmail')?.value.trim(),


        amount:
        document.getElementById('psAmount')?.value.trim()

    };



    if(!payload.email || !payload.amount){

        toast.error(
            'Email and amount required'
        );

        return;

    }



    try{


        const response =
            await api.post(
                '/payment/paystack/initiate',
                payload
            );



        document.getElementById(
            'psResponse'
        ).innerHTML =
        `
        <pre>
        ${escapeHtml(
            JSON.stringify(
                response,
                null,
                2
            )
        )}
        </pre>
        `;



        if(response.authorization_url){

            const link =
                document.getElementById(
                    'psOpenBtn'
                );


            if(link){

                link.href =
                response.authorization_url;


                link.style.display =
                'inline-block';

            }

        }


        toast.success(
            'Paystack initialized'
        );


        loadHistory();


    }
    catch(error){

        toast.error(
            error.message
        );

    }

}



// ===============================
// POS TERMINAL
// ===============================

async function createPOS(){


    const payload = {


        subscriberId:
        document.getElementById('posSubId')?.value.trim() || null,


        saleId:
        document.getElementById('posSaleId')?.value.trim() || null,


        amount:
        document.getElementById('posAmount')?.value.trim()

    };



    if(!payload.amount){

        toast.error(
            'Amount required'
        );

        return;

    }



    try{


        const response =
            await api.post(
                '/payment/pos/create',
                payload
            );



        lastPOSReference =
            response.reference ||
            response.transaction_reference;



        document.getElementById(
            'posResponse'
        ).innerHTML =
        `
        <pre>
        ${escapeHtml(
            JSON.stringify(
                response,
                null,
                2
            )
        )}
        </pre>
        `;



        toast.success(
            'POS transaction created'
        );


        loadHistory();


    }
    catch(error){

        toast.error(
            error.message
        );

    }

}




async function checkPOS(){


    if(!lastPOSReference){

        toast.error(
            'Create POS transaction first'
        );

        return;

    }



    try{


        const response =
            await api.post(
                '/payment/pos/webhook',
                {
                    reference:
                    lastPOSReference,

                    status:
                    'success'
                }
            );



        console.log(
            response
        );


        toast.success(
            'POS payment completed'
        );


        loadHistory();


    }
    catch(error){

        toast.error(
            error.message
        );

    }

}




// ===============================
// INIT
// ===============================

export function initIspPayments(){


    document
    .getElementById(
        'ispPaymentsRefreshBtn'
    )
    ?.addEventListener(
        'click',
        loadHistory
    );


    document
    .getElementById(
        'mpSendBtn'
    )
    ?.addEventListener(
        'click',
        sendSTK
    );


    document
    .getElementById(
        'psInitBtn'
    )
    ?.addEventListener(
        'click',
        initPaystack
    );


    document
    .getElementById(
        'posCreateBtn'
    )
    ?.addEventListener(
        'click',
        createPOS
    );


    document
    .getElementById(
        'posCheckBtn'
    )
    ?.addEventListener(
        'click',
        checkPOS
    );


    loadHistory();

}



export default {
    initIspPayments
};