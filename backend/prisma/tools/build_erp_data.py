"""Builds backend/prisma/data/charge-points.json from LTA's published files.

Inputs (both public):
  1. The ERP rates report PDF from OneMotoring (Base ERP rate tables, passenger cars).
  2. The LTA Gantry GeoJSON from data.gov.sg (dataset d_753090823cc9920ac41efaa6530c5893).

Usage:
  pip install pdfplumber
  python build_erp_data.py RATES.pdf LTAGantryGEOJSON.geojson OUTPUT.json YYYY-MM-DD

The date is the "With Effect From" date printed on the PDF. Gantries are matched across the two files
by gantry number. A few gantries have no number in the GeoJSON; their positions are taken from the
unlabelled gantries listed in INFERRED below and are marked as inferred in the output.
"""
import json
import math
import re
import sys

import pdfplumber

CITY = (1.2830, 103.8510)       # Raffles Place, for "towards the city"
ORCHARD = (1.3035, 103.8340)    # Orchard Road / Scotts Road, centre of the Orchard cordon
TUAS = (1.3200, 103.6400)

EXPRESSWAYS = {
    'AYE': 'AYER RAJAH EXPRESSWAY', 'BKE': 'BUKIT TIMAH EXPRESSWAY', 'CTE': 'CENTRAL EXPRESSWAY',
    'ECP': 'EAST COAST PARKWAY', 'KPE': 'KALLANG PAYA LEBAR EXPRESSWAY', 'MCE': 'MARINA COASTAL EXPRESSWAY',
    'PIE': 'PAN ISLAND EXPRESSWAY',
}

# Gantries in the rate tables whose GeoJSON feature carries no gantry number. Each is matched to the
# unlabelled feature at this midpoint (lat, lng), chosen from its described location.
INFERRED = {
    '41': ('OS041', None),
    '52': ('OS052', None),
    '53': ('OS053', None),
    '74': ('OS074', None),
    '35': ('', (1.34659, 103.85939)),   # CTE between Ang Mo Kio Ave 1 and Braddell Road
    '31': ('', (1.33337, 103.86242)),   # CTE southbound after Braddell Road
    '46': ('', (1.33274, 103.86218)),   # CTE northbound between PIE and Braddell Road
    '67': ('', (1.33315, 103.86185)),   # PIE to CTE northbound before Braddell Road
    '51': ('', (1.32609, 103.86053)),   # CTE northbound between Jalan Bahagia and PIE
    '70': ('', (1.31006, 103.87100)),   # Geylang Road westbound before Kallang River
    '9': ('UNK', (1.30272, 103.85349)),  # Bencoolen Street
    '23': ('', (1.29296, 103.84397)),   # River Valley Road
    '72': ('UNK', (1.28434, 103.86152)),  # Sheares Avenue towards Sheares Link
    '30': ('UNK', (1.29545, 103.87216)),  # ECP (City)
    '73': ('UNK', (1.29536, 103.87677)),  # ECP eastbound before KPE
}

# Charged directions that the description alone does not settle, as a bearing to aim for.
DIRECTION_OVERRIDES = {
    '32': 300,  # PIE westbound after the Kallang Bahru exit, and its slip road into Bendemeer Road
    '45': 300,
    '47': 125,  # YMCA gantry: Orchard Road is one-way towards Dhoby Ghaut
    '49': 125,  # Fort Canning Tunnel, same direction
}

# Shorter display names for columns that cover several gantries.
GROUP_NAMES = {
    ('52', '53', '74'): 'AYE citybound near Clementi',
    ('31', '33', '34'): 'CTE southbound after Braddell Road',
    ('46', '67'): 'CTE northbound between PIE and Braddell Road',
    ('32', '45'): 'PIE westbound after the Kallang Bahru exit',
    ('37', '38'): 'PIE eastbound after Adam Road',
    ('90', '91'): 'MCE westbound before the Central Boulevard and Maxwell Road exits',
    ('92', '93'): 'MCE eastbound after the Maxwell Road entry',
    ('61', '62', '64', '69'): 'New Bridge Road, South Bridge Road, Fullerton Road or Bayfront Avenue southbound',
    ('60', '63', '66'): 'Eu Tong Sen Street, Fullerton Road or Bayfront Avenue northbound',
    ('47', '49'): 'YMCA or Fort Canning Tunnel',
    ('43', '44'): 'Dunearn Road eastbound after Dunkirk Avenue',
    ('40', '71'): 'Bendemeer Road southbound after Woodsville Interchange',
}

# Single gantries whose LTA description reads awkwardly as a crossing name.
SINGLE_NAMES = {
    '41': 'AYE westbound after North Buona Vista Road',
}

# LTA's tables run from 07:00 to 20:00. A gantry with no charge on a day type in the table is free
# then, so it gets an explicit $0.00 period instead of looking like a missing schedule.
FREE_DAY = [['07:00', '20:00', '0.00']]

# Gantries with charges but no feature in the gantry map at all: approximate position and heading.
APPROXIMATE = {
    '50': (1.3535, 103.8915, 200),  # KPE southbound after Defu Flyover
}


def bearing(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    y = math.sin(dl) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def diff(a, b):
    return abs((a - b + 540) % 360 - 180)


def money(cell):
    return cell.strip().lstrip('$') if cell and cell.strip() else None


def merge(slots):
    """[(start, end, rate)] in time order -> merged periods with the same rate."""
    out = []
    for start, end, rate in slots:
        if out and out[-1][1] == start and out[-1][2] == rate:
            out[-1] = (out[-1][0], end, rate)
        else:
            out.append((start, end, rate))
    return [list(p) for p in out]


def read_tables(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        return [{'page': i + 1, 'rows': t} for i, p in enumerate(pdf.pages) for t in p.extract_tables()]


def columns(tables, kind):
    """Yield (description, gantry-number cell, day type, [(start, end, rate)])."""
    pages = [t['rows'] for t in tables if t['rows'] and t['rows'][0][0] and 'BASE ERP RATE TABLE' in t['rows'][0][0]]
    group = [r for r in pages if any(c and kind in c for c in r[1])]
    header = next(r for r in group[0] if r[0] == 'Time')
    numbers = next(r for r in group[0] if r[0] and r[0].startswith('Gantry'))
    days = next(r for r in group[0] if any(c in ('Weekdays', 'Saturdays') for c in r if c))
    day_of = {}
    current = None
    for i, c in enumerate(days):
        if c in ('Weekdays', 'Saturdays'):
            current = 'WEEKDAY' if c == 'Weekdays' else 'SATURDAY'
        day_of[i] = current
    rows = [r for t in group for r in t if r[0] and re.match(r'\d\d:\d\d - \d\d:\d\d', r[0])]
    for i in range(1, len(header)):
        slots = []
        for r in rows:
            rate = money(r[i])
            if rate:
                start, end = [s.strip() for s in r[0].split('-')]
                slots.append((start, end, rate))
        yield header[i].replace('\n', ' ').strip(), numbers[i].strip(), day_of.get(i) or 'WEEKDAY', merge(slots)


def refer_lists(tables):
    out = {}
    for t in tables:
        first = t['rows'][0][0] or ''
        if first.startswith('Refer #'):
            out[first.split('#')[1].rstrip(':').strip()] = [(r[0].strip(), r[1].strip()) for r in t['rows'][2:]]
    return out


def gantry_lines(geojson_path):
    data = json.load(open(geojson_path, encoding='utf8'))
    out = []
    for f in data['features']:
        m = re.search(r'GNTRY_NUM</th> <td>([^<]*)</td>', f['properties'].get('Description', ''))
        coords = f['geometry']['coordinates']
        a, b = (coords[0][1], coords[0][0]), (coords[-1][1], coords[-1][0])
        out.append({'num': m.group(1).strip() if m else '', 'a': a, 'b': b,
                    'mid': ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)})
    return out


def roads_for(desc):
    found = [abbr for abbr in EXPRESSWAYS if re.search(rf'\b{abbr}\b', desc)]
    if found:
        return [r for abbr in found for r in (EXPRESSWAYS[abbr], abbr)]
    m = re.match(r"([A-Z][A-Za-z' .]+?(Road|Street|Avenue|Ave|Boulevard|Highway|Link|Turn|Way|Rd|St))\b", desc)
    if not m:
        return []
    name = re.sub(r'\bRd\b', 'Road', m.group(1))
    name = re.sub(r'\bAve\b', 'Avenue', name)
    name = re.sub(r'\bSt\b', 'Street', name)
    return [name.upper()]


def target_bearing(desc, mid, cordon, rates):
    d = desc.lower()
    for word, b in (('northbound', 0), ('southbound', 180), ('eastbound', 90), ('westbound', 270)):
        if word in d:
            return b
    if 'tuasbound' in d:
        return bearing(mid, TUAS)
    if cordon == 'ORCHARD':
        return bearing(mid, ORCHARD)
    pm_only = rates and all(p[0] >= '12:00' for p in rates)
    towards_city = bearing(mid, CITY)
    return (towards_city + 180) % 360 if pm_only else towards_city


def main(pdf_path, geojson_path, out_path, effective):
    tables = read_tables(pdf_path)
    refer = refer_lists(tables)
    lines = gantry_lines(geojson_path)
    by_num = {}
    for g in lines:
        by_num.setdefault(g['num'], []).append(g)

    entries = {}
    for kind in ('Orchard Cordon', 'Arterial Roads'):
        for desc, cell, day, rates in columns(tables, kind):
            if cell.startswith('Refer to'):
                members = refer[cell.split()[-1]]
                cordon = 'ORCHARD' if cell.split()[-1] == '3' else 'CBD'
            else:
                members = [(n.strip(), desc) for n in cell.split(',')]
                cordon = 'ORCHARD' if 'YMCA' in desc else ('CBD' if kind == 'Orchard Cordon' else None)
            # Gantries LTA lists together in one row are alternative entries to the same charging
            # point (main carriageway and slip roads), so a trip pays at most one of them. They
            # share a zone ID, which the app uses to count only the first it passes.
            nums = [] if cell.startswith('Refer') else [n.strip() for n in cell.split(',')]
            zone = 'G' + '+G'.join(nums) if len(nums) > 1 else None
            group_name = next((v for k, v in GROUP_NAMES.items()
                               if not cell.startswith('Refer') and tuple(cell.replace(' ', '').split(',')) == k), None)
            for num, location in members:
                if cell.startswith('Refer') or cordon:
                    label = 'Orchard' if cordon == 'ORCHARD' else 'CBD'
                    display = f'{group_name or location} ({label} cordon)'
                else:
                    display = group_name or location
                display = SINGLE_NAMES.get(num, display)
                e = entries.setdefault(num, {'num': num, 'location': location, 'group': desc,
                                             'cordon': cordon, 'rates': {}, 'display': display,
                                             'zone': zone or f'G{num}'})
                if rates:
                    e['rates'][day] = rates

    for e in entries.values():
        for day in ('WEEKDAY', 'SATURDAY'):
            e['rates'].setdefault(day, FREE_DAY)

    points, unplaced = [], []
    for num, e in sorted(entries.items(), key=lambda kv: int(kv[0])):
        source = 'LTA gantry map'
        if num not in by_num and num not in INFERRED and num in APPROXIMATE:
            lat, lng, heading = APPROXIMATE[num]
            points.append({
                'code': f'G{num}', 'name': f"{e['display']}, gantry {num}", 'zoneId': e['zone'],
                'lat': lat, 'lng': lng, 'headingDeg': heading, 'roads': roads_for(e['location']),
                'rates': e['rates'],
                'position': 'approximate: not in the LTA gantry map; matched by road name within 350 m',
            })
            continue
        if num in by_num:
            g = by_num[num][0]
        elif num in INFERRED:
            label, near = INFERRED[num]
            pool = [x for x in lines if x['num'] == label]
            if near:
                pool.sort(key=lambda x: math.dist(x['mid'], near))
            if not pool:
                unplaced.append(num)
                continue
            g = pool[0]
            source = f"LTA gantry map, unlabelled feature{f' {label}' if label else ''} matched by location"
        else:
            unplaced.append(num)
            continue
        across = bearing(g['a'], g['b'])
        options = [(across + 90) % 360, (across + 270) % 360]
        all_rates = [p for day in e['rates'].values() for p in day if p[2] != '0.00']
        target = DIRECTION_OVERRIDES.get(num) or target_bearing(
            e['location'] + ' ' + e['group'], g['mid'], e['cordon'], all_rates)
        heading = min(options, key=lambda h: diff(h, target))
        points.append({
            'code': f'G{num}',
            'name': f"{e['display']}, gantry {num}",
            'zoneId': e['zone'],
            'lat': round(g['mid'][0], 6),
            'lng': round(g['mid'][1], 6),
            'headingDeg': round(heading),
            'roads': roads_for(e['location'] if e['location'] != e['group'] else e['group']),
            'rates': e['rates'],
            'position': source,
        })

    out = {
        'note': (f'LTA base ERP rates for passenger cars, taxis and light goods vehicles with effect from {effective}, '
                 'from the OneMotoring rate tables, placed at the gantry positions in LTA\'s gantry map '
                 '(data.gov.sg). Charged directions are inferred from the location descriptions. '
                 'Rebuild with backend/prisma/tools/build_erp_data.py when LTA publishes new rates.'),
        'effectiveDate': effective,
        'chargePoints': points,
    }
    json.dump(out, open(out_path, 'w', encoding='utf8'), indent=2)
    print(f'{len(points)} gantries written; no position for: {", ".join(unplaced) or "none"}')


if __name__ == '__main__':
    main(*sys.argv[1:5])
