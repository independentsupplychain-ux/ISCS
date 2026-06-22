# Specify the base Docker image — includes Playwright + Chrome pre-installed
FROM apify/actor-node-playwright-chrome:24-1.60.0

# Copy package files and install dependencies
COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "NPM install finished"

# Copy actor source
COPY . ./

# Run the actor
CMD npm start
