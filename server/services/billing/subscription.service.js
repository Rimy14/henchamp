/**
 * Subscription Billing Service
 *
 * Owns:
 * - isp_subscriptions billing status
 * - invoice reference
 * - payment timestamps
 *
 * Does NOT:
 * - activate/suspend users directly
 * - modify RADIUS
 *
 * Lifecycle changes are handled by lifecycle.service.js
 */

import { query, transaction } from '../../config/database.js';


export async function createSubscriptionPeriod({
    subscriberId,
    packageId,
    periodStart,
    periodEnd,
    amount,
    currency = 'KES',
    invoiceRef = null
}) {

    const result = await query(
        `
        INSERT INTO isp_subscriptions
        (
            subscriber_id,
            package_id,
            period_start,
            period_end,
            amount,
            currency,
            status,
            invoice_ref
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        `,
        [
            subscriberId,
            packageId,
            periodStart,
            periodEnd,
            amount,
            currency,
            invoiceRef
        ]
    );


    return {
        id: result.insertId,
        subscriberId,
        status: 'pending'
    };
}



export async function markSubscriptionPaid(
    subscriptionId,
    invoiceRef
){

    await query(
        `
        UPDATE isp_subscriptions
        SET
            status='paid',
            invoice_ref=?,
            paid_at=NOW()
        WHERE id=?
        `,
        [
            invoiceRef,
            subscriptionId
        ]
    );


    return getSubscription(subscriptionId);
}



export async function markSubscriptionOverdue(
    subscriptionId
){

    await query(
        `
        UPDATE isp_subscriptions
        SET status='overdue'
        WHERE id=?
        `,
        [
            subscriptionId
        ]
    );


    return getSubscription(subscriptionId);
}



export async function getSubscription(id){

    const rows = await query(
        `
        SELECT *
        FROM isp_subscriptions
        WHERE id=?
        `,
        [
            id
        ]
    );


    return rows[0] || null;
}



export async function getActiveSubscription(subscriberId){

    const rows = await query(
        `
        SELECT *
        FROM isp_subscriptions
        WHERE subscriber_id=?
        AND status='paid'
        ORDER BY period_end DESC
        LIMIT 1
        `,
        [
            subscriberId
        ]
    );


    return rows[0] || null;
}