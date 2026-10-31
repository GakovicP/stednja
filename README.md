# Štedna knjižica

Evidencija štednje za dve osobe: plata u EUR, imenovani stalni troškovi, ostali troškovi po kategorijama, mesečni izveštaj i ušteđevina. Radi na PocketBase-u (baza + prijava u jednom programu) iza nginx-a.

```
pb_public/       aplikacija (HTML, JS, ikonice)
pb_migrations/   šema baze, primenjuje se sama pri pokretanju
deploy/          systemd servis, nginx konfiguracija, skripte za instalaciju i ažuriranje
```

U primerima ispod zameni `stednja.tvojdomen.rs`, `GakovicP` i IP servera svojim vrednostima.

## 1. GitHub

Napravi **privatni** repo `stednja` i postavi ove fajlove u njega:

```bash
cd stednja
git init && git add . && git commit -m "Prva verzija"
git branch -M main
git remote add origin git@github.com:GakovicP/stednja.git
git push -u origin main
```

## 2. DNS

Kod registra domena dodaj **A zapis** `stednja` koji pokazuje na IP servera. Proveri sa `ping stednja.tvojdomen.rs` pre koraka 6.

## 3. Kloniranje na server

Na serveru napravi deploy ključ (samo za čitanje) za ovaj repo:

```bash
ssh-keygen -t ed25519 -f /root/.ssh/stednja_deploy -N ""
cat /root/.ssh/stednja_deploy.pub
```

Sadržaj `.pub` fajla dodaj na GitHub-u: repo → Settings → Deploy keys → Add deploy key (bez "Allow write access"). Zatim:

```bash
cat >> /root/.ssh/config <<'EOF'
Host github-stednja
  HostName github.com
  User git
  IdentityFile /root/.ssh/stednja_deploy
EOF
git clone github-stednja:GakovicP/stednja.git /opt/stednja
```

## 4. Instalacija

```bash
cd /opt/stednja
bash deploy/install.sh
```

Skripta preuzima PocketBase, pravi sistemskog korisnika `stednja`, podešava SELinux ako je uključen i pokreće servis na `127.0.0.1:8090`. Na kraju treba da vidiš `PocketBase radi.`

## 5a. Ako portove 80/443 već drži Caddy u Docker-u

PocketBase se vezuje na adresu docker0 interfejsa, da bi Caddy iz kontejnera mogao do njega:

```bash
DOCKER_IP=$(ip -4 -o addr show docker0 | awk '{print $4}' | cut -d/ -f1)
sed -i "s/--http=127.0.0.1:8090/--http=${DOCKER_IP}:8090/" /etc/systemd/system/stednja.service
systemctl daemon-reload && systemctl restart stednja
```

Zatim dodaj sadržaj `deploy/Caddyfile.snippet` (sa pravim domenom i IP-om) na kraj Caddyfile-a i uradi `caddy reload` u kontejneru. HTTPS Caddy rešava sam, pa korak 6 preskačeš.

## 5. nginx

```bash
cp deploy/nginx-stednja.conf /etc/nginx/conf.d/stednja.conf
sed -i 's/stednja.tvojdomen.rs/TVOJ.POD.DOMEN/' /etc/nginx/conf.d/stednja.conf
nginx -t && systemctl reload nginx
```

## 6. HTTPS

```bash
certbot --nginx -d stednja.tvojdomen.rs
```

Certbot dopisuje HTTPS u isti nginx blok i podešava preusmeravanje sa HTTP-a.

## 7. Administrator i dva naloga

Administratorski nalog (samo za tebe, za upravljanje):

```bash
sudo -u stednja /opt/stednja/pocketbase superuser upsert tvoj@email.com 'JAKA_LOZINKA' --dir=/opt/stednja/pb_data
```

Admin panel nije dostupan spolja, pa mu pristupaš preko SSH tunela sa svog računara:

```bash
ssh -L 8090:127.0.0.1:8090 root@IP_SERVERA
```

Otvori `http://localhost:8090/_/`, prijavi se kao administrator i u kolekciji **users** napravi dva zapisa (New record): email, lozinka i **name** (to ime se prikazuje uz troškove). Javna registracija je isključena, pa niko drugi ne može da napravi nalog.

U panelu je dobro uključiti i:
- **Settings → Backups**: automatski bekap, npr. svake noći (`0 3 * * *`)
- **Settings → Rate limits**: zaštita od pogađanja lozinke

## 8. Na telefonu

Otvori `https://stednja.tvojdomen.rs` i prijavi se.
- iPhone (Safari): Podeli → Dodaj na početni ekran
- Android (Chrome): meni ⋮ → Dodaj na početni ekran / Instaliraj aplikaciju

## Ažuriranje

Posle svake izmene koja je push-ovana na GitHub:

```bash
bash /opt/stednja/deploy/update.sh
```

## Korisne komande

```bash
systemctl status stednja        # da li radi
journalctl -u stednja -n 50     # logovi
```

Svi podaci su u `/opt/stednja/pb_data` (SQLite baza i bekapi). Taj direktorijum uključi u svoj redovni bekap.
