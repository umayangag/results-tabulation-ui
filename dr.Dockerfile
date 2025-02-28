FROM tiangolo/node-frontend:10 as builder

ADD ./src /app/src
COPY package*.json /app/
COPY ./public /app/public
WORKDIR /app
RUN npm install

ENV REACT_APP_AUTH_APP_URL="https://tabulations.elections.gov.lk"
ENV REACT_APP_TABULATION_API_URL="https://apim-gw-dr-do.elections.gov.lk/tabulation/0.1.0"

RUN npm run build

FROM nginx:1.15

COPY --from=builder /app/build/ /usr/share/nginx/html
COPY --from=builder /nginx.conf /etc/nginx/conf.d/default.conf
WORKDIR /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"];
