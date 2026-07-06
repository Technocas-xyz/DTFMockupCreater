FROM node:20 AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM php:8.2-apache

# Enable Apache modules
RUN a2enmod rewrite headers

# Install PDO MySQL extension for authentication
RUN docker-php-ext-install pdo pdo_mysql

# Set PHP settings for large uploads
RUN echo "post_max_size = 50M" >> /usr/local/etc/php/conf.d/uploads.ini && \
    echo "upload_max_filesize = 50M" >> /usr/local/etc/php/conf.d/uploads.ini && \
    echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/uploads.ini && \
    echo "max_execution_time = 60" >> /usr/local/etc/php/conf.d/uploads.ini

# Copy built React app to Apache document root
COPY --from=builder /app/dist/ /var/www/html/

# Copy PHP API files
COPY api/ /var/www/html/api/

# Copy public assets
COPY public/ /var/www/html/

# Ensure garment-data directory exists and is writable
RUN mkdir -p /var/www/html/api/garment-data && \
    chmod 777 /var/www/html/api/garment-data && \
    chown -R www-data:www-data /var/www/html/api/garment-data

# Apache config: serve index.html for SPA routes, allow PHP in /api
RUN echo '<Directory /var/www/html>\n\
    Options -Indexes +FollowSymLinks\n\
    AllowOverride All\n\
    Require all granted\n\
    DirectoryIndex index.html\n\
    FallbackResource /index.html\n\
</Directory>\n\
<Directory /var/www/html/api>\n\
    FallbackResource disabled\n\
    Options -Indexes\n\
    AllowOverride All\n\
    Require all granted\n\
</Directory>' > /etc/apache2/conf-available/app.conf && \
    a2enconf app

# Set proper permissions
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
