import toast from '../toast.js';

export function initIspNas() {
    document.getElementById('ispNasRefreshBtn')?.addEventListener('click', () => {
        toast.info('ISP NAS page is not yet implemented.');
    });
}

initIspNas();

export default { initIspNas };
