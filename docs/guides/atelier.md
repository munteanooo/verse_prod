# Creează o ciornă de tipar în VERSE

1. Intră în **Administrare** după autentificare și confirmarea în doi pași.
2. În **Categorii**, adaugă categoria și stabilește ordinea ei de afișare. În **Măsurători**, adaugă definițiile de care ai nevoie, cu unitatea, intervalul și instrucțiunile de măsurare.
3. Deschide **Tipare** și apasă **Creează un tipar**. Completează informațiile generale pe care le ai. Poți apăsa **Salvează ciorna** în orice pas. Revii din **Tipare → Editează**.
4. În **Piese**, adaugă fiecare piesă, cantitatea de croit, materialul, direcția firului și rezerva de cusătură. Folosește butoanele de mutare pentru a schimba ordinea.
5. În **Măsurători**, selectează doar definițiile necesare pentru această piesă vestimentară. Poți deschide biblioteca într-o filă separată, adăuga o definiție și actualiza lista fără să pierzi ciorna. Poți marca o măsurătoare ca obligatorie și poți restrânge intervalul. Formularul de previzualizare îți arată ce va vedea clientul.
6. În **Mărimi**, adaugă etichete proprii sau mărimi standard. Bifează măsurătorile pentru care vrei să definești intervale. Verifică avertismentele dacă intervalele se suprapun.
7. În **Preț**, alege gratuit sau premium. Pentru premium, introdu suma și moneda.
8. În **Revizuire**, verifică lista de cerințe și salvează. **Previzualizează** deschide datele salvate. Publicarea cere documente validate și pregătite pentru imprimare.

Dacă o colegă a salvat între timp aceeași ciornă, serverul păstrează salvarea deja efectuată. Consultă ciorna actualizată și refă schimbările necesare înainte de a salva din nou.

## Ce vede clientul

În catalog apar numai tiparele publicate. După publicare, fiecare tipar afișează piesele, materialele și instrucțiunile salvate în versiunea respectivă. Câmpurile de măsurare apar în ordinea stabilită în atelier, cu denumirea, unitatea și intervalul alese.

Clientul poate calcula mărimile compatibile fără să își salveze măsurătorile. Dacă există mai multe potriviri, le vede pe toate și poate alege orice mărime din tabel. Un profil salvat este privat și se creează doar printr-o acțiune explicită în **Profilurile mele de măsurători**.

## Încarcă, verifică și publică documentele

1. Salvează ciorna. În **Informații generale**, încarcă o fotografie de copertă în JPEG, PNG sau WebP și scrie un text alternativ descriptiv. Poți adăuga fotografii în galerie și schimba ordinea. Repetă încărcarea copertei ca să o înlocuiești.
2. În **Mărimi**, alege mărimea și încarcă un PDF complet sau câte un PDF pentru fiecare piesă. Alege dacă documentul este deja împărțit pe A4 sau dacă trebuie împărțit la scară reală.
3. Verifică reperul de pe documentul original. Notează ce ai măsurat și apasă **Confirmă scara originală**. Confirmarea se face pentru fiecare fișier.
4. Alege mărimea pentru procesare, păstrează setările de margine și suprapunere potrivite imprimantei și apasă **Generează documentul A4**. Descarcă documentul pentru verificare. Dacă ai schimbat ciorna după generare, generează din nou.
5. În **Revizuire**, verifică fotografia, piesele, mărimile și documentul pentru fiecare mărime. Apasă **Publică tiparul**. Din previzualizare poți retrage tiparul din catalog sau crea o ciornă nouă pentru o ediție ulterioară.

### Probă locală

Rulează `node scripts/documents/demo.mjs /tmp/verse-demo` într-un director de ieșire nou. Se generează un PDF vectorial sintetic de 320 × 430 mm cu reper de 100 mm și o imagine de probă originală. În admin creează o categorie, o piesă, o măsurătoare cu interval 40–120 cm și o mărime cu interval 65–85 cm. Completează descrierile, alege **Gratuit** și salvează. Încarcă imaginea și PDF-ul folosind pașii de mai sus. Alege **La scară reală**, confirmă reperul de 100 mm și generează documentul. Setările implicite produc patru foi și o pagină de asamblare. Geometria este sintetică și servește exclusiv la testarea imprimării.
