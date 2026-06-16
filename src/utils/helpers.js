module.exports = {
    formatUGX: (amount) => {
        return `UGX ${parseFloat(amount || 0).toLocaleString('en-UG')}`;
    },
    formatDate: (date) => {
        if (!date) return '';
        const d = new Date(date);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const dayName = days[d.getDay()];
        const day = String(d.getDate()).padStart(2, '0');
        const monthName = months[d.getMonth()];
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');

        return `${dayName}, ${day} ${monthName} ${year} at ${hours}:${minutes}`;
    },
    timeAgo: (timestamp) => {
        if (!timestamp) return '';
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return "Just now";
    },
    paginate: (queryPage, queryLimit) => {
        const page = parseInt(queryPage) || 1;
        const limit = parseInt(queryLimit) || 10;
        const offset = (page - 1) * limit;
        return { page, limit, offset };
    },
    generateBreadcrumb: (items) => {
        return items.map(item => ({ label: item.label, url: item.url }));
    }
};
