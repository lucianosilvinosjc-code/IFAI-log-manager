const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const api = {
  async get(endpoint: string) {
    const res = await fetch(endpoint, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('API Error');
    return res.json();
  },

  async post(endpoint: string, data: any) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'API Error');
    }
    return res.json();
  },

  async put(endpoint: string, data: any) {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('API Error');
    return res;
  },
};
