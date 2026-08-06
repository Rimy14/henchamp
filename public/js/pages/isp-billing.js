import toast from '../toast.js';

export function initIspBilling() {
    document.getElementById('ispBillingRefreshBtn')?.addEventListener('click', () => {
        toast.info('ISP billing page is not yet implemented.');
    });
}

initIspBilling();

export default { initIspBilling };
