# syntax=docker/dockerfile:1

# ---------------------------------------
# Base FrankenPHP upstream image
# ---------------------------------------
FROM dunglas/frankenphp:1-php8.4 AS frankenphp_upstream

# ---------------------------------------
# Base FrankenPHP image
# ---------------------------------------
FROM frankenphp_upstream AS frankenphp_base

WORKDIR /app

# persistent / runtime deps
# добавляем dev-lib для сборки GD/Imagick с поддержкой webp/jpeg/png/freetype
RUN apt-get update && apt-get install -y --no-install-recommends \
    file \
    git \
    ca-certificates \
    curl \
    build-essential \
    pkg-config \
    zlib1g-dev \
    libwebp-dev \
    libjpeg-dev \
    libpng-dev \
    libfreetype6-dev \
    libmagickwand-7.q16-dev \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# PHP extensions
# Конфигурируем GD чтобы собрать с webp/jpeg/freetype (если заголовки доступны),
# затем ставим нужные расширения включая gd и imagick.
RUN set -eux; \
    # если available, подготовим конфиг для сборки gd
    if command -v docker-php-ext-configure > /dev/null 2>&1; then \
        docker-php-ext-configure gd --with-webp --with-jpeg --with-freetype || true; \
    fi; \
    install-php-extensions \
        @composer \
        apcu \
        intl \
        opcache \
        zip \
        mongodb \
        gd \
        imagick \
    ;

ENV COMPOSER_ALLOW_SUPERUSER=1
ENV PHP_INI_SCAN_DIR=":$PHP_INI_DIR/app.conf.d"

# Copy custom configs and entrypoint
COPY --link frankenphp/conf.d/10-app.ini $PHP_INI_DIR/app.conf.d/
COPY --link --chmod=755 frankenphp/docker-entrypoint.sh /usr/local/bin/docker-entrypoint
COPY --link frankenphp/Caddyfile /etc/frankenphp/Caddyfile

RUN mkdir -p /data/caddy \
    && chown -R www-data:www-data /data

ENTRYPOINT ["docker-entrypoint"]

HEALTHCHECK --start-period=60s CMD curl -f http://localhost:2019/metrics || exit 1
CMD [ "frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile" ]

# ---------------------------------------
# Dev FrankenPHP image
# ---------------------------------------
FROM frankenphp_base AS frankenphp_dev

ENV APP_ENV=dev
ENV XDEBUG_MODE=off
ENV FRANKENPHP_WORKER_CONFIG=watch

RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

# Xdebug for dev
RUN set -eux; \
    install-php-extensions xdebug

COPY --link frankenphp/conf.d/20-app.dev.ini $PHP_INI_DIR/app.conf.d/

# Copy Composer files & install deps (cacheable layer)
COPY --link composer.* symfony.* ./
RUN composer install --no-cache --prefer-dist --no-scripts --no-progress

# NOTE: Do NOT run `composer require` during build.
# Add/lock additional composer deps (e.g. doctrine/mongodb-odm-bundle) on the host or in a running container,
# then rebuild the image so vendor files are installed deterministically.

# Copy sources
COPY --link --exclude=frankenphp/ . ./

# ---------------------------------------
# Prod FrankenPHP image
# ---------------------------------------
FROM frankenphp_base AS frankenphp_prod

ENV APP_ENV=prod

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY --link frankenphp/conf.d/20-app.prod.ini $PHP_INI_DIR/app.conf.d/

# Copy Composer files & install only prod deps
COPY --link composer.* symfony.* ./
RUN set -eux; \
    composer install --no-cache --prefer-dist --no-dev --no-autoloader --no-scripts --no-progress

# Copy sources
COPY --link --exclude=frankenphp/ . ./

RUN set -eux; \
    mkdir -p var/cache var/log var/share; \
    composer dump-autoload --classmap-authoritative --no-dev; \
    composer dump-env prod; \
    composer run-script --no-dev post-install-cmd; \
    chmod +x bin/console; sync;
