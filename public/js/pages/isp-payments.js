import toast from '../toast.js';

export function initIspPayments() {
    document.getElementById('ispPaymentsRefreshBtn')?.addEventListener('click', () => {
        toast.info('ISP payments page is not yet implemented.');
    });
}

initIspPayments();

export default { initIspPayments };
