from django.shortcuts import render
from django.contrib.auth import authenticate, login, logout
from django.http import HttpResponseRedirect, HttpResponse
from django.conf import settings
from django.core.urlresolvers import reverse
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from lots_admin.models import Application, Lot
from datetime import datetime
import csv
import json

def lots_login(request):
    if request.method == 'POST':
        form = AuthenticationForm(data=request.POST)
        if form.is_valid():
            user = form.get_user()
            if user is not None:
                login(request, user)
                return HttpResponseRedirect(reverse('lots_admin.views.lots_admin'))
    else:
        form = AuthenticationForm()
    return render(request, 'lots_login.html', {'form': form})

def lots_logout(request):
    logout(request)
    return HttpResponseRedirect('/')

@login_required(login_url='/lots-login/')
def lots_admin_map(request):
    applied_pins = set()
    for lot in Lot.objects.all():
        applied_pins.add(lot.pin)

    pins_str = ",".join(["'%s'" % a.replace('-','').replace(' ','') for a in applied_pins])
    return render(request, 'admin-map.html', {'applied_pins': pins_str})

@login_required(login_url='/lots-login/')
def lots_admin(request):
    applications = Application.objects.filter(pilot=settings.CURRENT_PILOT)
    return render(request, 'admin.html', {
        'applications': applications, 
        'selected_pilot': settings.CURRENT_PILOT, 
        'pilot_info': settings.PILOT_INFO})

@login_required(login_url='/lots-login/')
def pilot_admin(request, pilot):
    applications = Application.objects.filter(pilot=pilot)
    return render(request, 'admin.html', {
        'applications': applications, 
        'selected_pilot': pilot, 
        'pilot_info': settings.PILOT_INFO})

@login_required(login_url='/lots-login/')
def csv_dump(request, pilot):
    response = HttpResponse(content_type='text/csv')
    now = datetime.now().isoformat()
    response['Content-Disposition'] = 'attachment; filename=Large_Lots_Applications_%s_%s.csv' % (pilot, now)
    applications = Application.objects.filter(pilot=pilot)
    header = [
        'ID', 
        'Date received', 
        'Name', 
        'Organization', 
        'Owned Full Address', 
        'Owned Street Number', 
        'Owned Street Direction',
        'Owned Street Name',
        'Owned Street Type',
        'Owned PIN', 
        'Deed Image URL',
        'Contact Address',
        'Phone', 
        'Email', 
        'Received assistance',
        'Lot 1 PIN',
        'Lot 1 Full Address',
        'Lot 1 Street Number',
        'Lot 1 Street Direction',
        'Lot 1 Street Name',
        'Lot 1 Street Type',
        'Lot 1 Image URL',
        'Lot 2 PIN',
        'Lot 2 Full Address',
        'Lot 2 Street Number',
        'Lot 2 Street Direction',
        'Lot 2 Street Name',
        'Lot 2 Street Type',
        'Lot 2 Image URL',
    ]
    rows = []
    for application in applications:
        owned_full_address = '%s %s %s %s' % \
            (getattr(application.owned_address, 'street', ''),
             getattr(application.owned_address, 'city', ''),
             getattr(application.owned_address, 'state', ''),
             getattr(application.owned_address, 'zip_code', ''))
        owned_street_number = application.owned_address.street_number
        owned_street_dir = application.owned_address.street_dir
        owned_street_name = application.owned_address.street_name
        owned_street_type = application.owned_address.street_type
        contact_address = '%s %s %s %s' % \
            (getattr(application.contact_address, 'street', ''),
             getattr(application.contact_address, 'city', ''),
             getattr(application.contact_address, 'state', ''),
             getattr(application.contact_address, 'zip_code', ''))
        lots = []
        for lot in application.lot_set.all():
            full_addr = '%s %s %s %s' % \
                (getattr(lot.address, 'street', ''),
                 getattr(lot.address, 'city', ''),
                 getattr(lot.address, 'state', ''),
                 getattr(lot.address, 'zip_code', ''))
            pin = lot.pin
            image_url = 'http://cookviewer1.cookcountyil.gov/Jsviewer/image_viewer/requestImg.aspx?%s=' % pin.replace('-', '')
            lots.extend([
                pin, 
                full_addr, 
                lot.address.street_number, 
                lot.address.street_dir, 
                lot.address.street_name,
                lot.address.street_type,
                image_url
            ])
        if len(lots) < 8:
            lots.extend(['', '', '', '', '', '', ''])
        lot_1 = lots[:7]
        lot_2 = lots[7:]
        lot_1_pin, lot_1_addr, lot_1_street_number, lot_1_street_dir, \
            lot_1_street_name, lot_1_street_type, lot_1_image = lot_1
        lot_2_pin, lot_2_addr, lot_2_street_number, lot_2_street_dir, \
            lot_2_street_name, lot_2_street_type, lot_2_image = lot_2
        rows.append([
            application.id,
            application.received_date.strftime('%Y-%m-%d %H:%m %p'),
            '%s %s' % (application.first_name, application.last_name),
            application.organization,
            owned_full_address, 
            owned_street_number, 
            owned_street_dir, 
            owned_street_name, 
            owned_street_type, 
            application.owned_pin,
            application.deed_image.url,
            contact_address, 
            application.phone,
            application.email,
            application.how_heard,
            lot_1_pin,
            lot_1_addr,
            lot_1_street_number,
            lot_1_street_dir,
            lot_1_street_name,
            lot_1_street_type,
            lot_1_image,
            lot_2_pin,
            lot_2_addr,
            lot_2_street_number,
            lot_2_street_dir,
            lot_2_street_name,
            lot_2_street_type,
            lot_2_image,
        ])
    writer = csv.writer(response)
    writer.writerow(header)
    writer.writerows(rows)
    return response
