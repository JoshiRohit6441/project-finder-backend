#=========================================================================#
# Project Finder — Hestia proxy template (HTTP)
# Applies only to the domain that selects this template.
#=========================================================================#

server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

    location ~ /\.(?!well-known\/|file) {
        deny all;
        return 404;
    }

    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root %docroot%;
        allow all;
    }

    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "";
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
