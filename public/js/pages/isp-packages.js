import toast from '../toast.js';

export function initIspPackages() {
    document.getElementById('ispPackagesRefreshBtn')?.addEventListener('click', () => {
        toast.info('ISP packages page is not yet implemented.');
    });
}

initIspPackages();

export default { initIspPackages };
