# Nginx
This nginx configuration and certificates are only used for local dev testing and not for the production environment. This is to help with testing the authentication system locally

Use this command to start the nginx server from this directory
```
sudo nginx -c "$(pwd)/dashboard.conf" -g 'daemon off;'
```